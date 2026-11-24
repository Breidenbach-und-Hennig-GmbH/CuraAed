using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

// TAPI-Monitorrechte: keine Wahl, Rufannahme, Rufnummern oder Gesprächsdaten.
public sealed class TapiMonitor {
 [StructLayout(LayoutKind.Sequential,Pack=1)] struct Init {public uint Total,Needed,Used,Options;public IntPtr Event;public uint Completion;}
 [StructLayout(LayoutKind.Sequential)] struct Ext {public uint A,B,C,D;}
 [StructLayout(LayoutKind.Sequential,Pack=1)] struct Message {public uint Device,Kind;public UIntPtr Instance,P1,P2,P3;}
 // HLINEAPP, HLINE und HCALL sind laut Windows-SDK auch unter x64 DWORD.
 [DllImport("tapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)] static extern int lineInitializeExW(out uint app,IntPtr instance,IntPtr callback,string name,out uint devices,ref uint version,ref Init init);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineNegotiateAPIVersion(uint app,uint id,uint low,uint high,out uint version,out Ext extension);
 [DllImport("tapi32.dll",CharSet=CharSet.Unicode,ExactSpelling=true)] static extern int lineGetDevCapsW(uint app,uint id,uint version,uint ext,IntPtr caps);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineOpen(uint app,uint id,out uint line,uint version,uint ext,UIntPtr instance,uint privileges,uint media,IntPtr parameters);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineSetStatusMessages(uint line,uint states,uint addressStates);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineGetMessage(uint app,out Message message,uint timeout);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineGetNewCalls(uint line,uint address,uint select,IntPtr calls);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineGetCallStatus(uint call,IntPtr status);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineGetLineDevStatus(uint line,IntPtr status);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineDeallocateCall(uint call);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineClose(uint line);
 [DllImport("tapi32.dll",ExactSpelling=true)] static extern int lineShutdown(uint app);
 static void Check(int rc){if(rc<0)throw new InvalidOperationException("TAPI 0x"+((uint)rc).ToString("X8"));}
 static int Used(IntPtr b,int min){int n=Marshal.ReadInt32(b,8);if(n<min||n>65536)throw new InvalidOperationException("Ungültige TAPI-Antwort.");return n;}
 static string Provider(IntPtr b){int used=Used(b,44),n=Marshal.ReadInt32(b,12),off=Marshal.ReadInt32(b,16);if(n<0||off<0||off>used||n>used-off)throw new InvalidOperationException("Ungültiger Anbieter.");byte[] bytes=new byte[n];Marshal.Copy(IntPtr.Add(b,off),bytes,0,n);return (Marshal.ReadInt32(b,40)==3?System.Text.Encoding.Unicode:System.Text.Encoding.Default).GetString(bytes).TrimEnd('\0');}
 public static string Einordnen(uint flags,int active,int held,IEnumerable<uint> states){
  if((flags&5)!=5)return "abgemeldet";
  bool unknown=false;foreach(uint s in states){if((s&0x3f38)!=0)return "telefoniert";if((s&0x8000)!=0)unknown=true;}
  return unknown||active>0||held>0?"unbekannt":"angemeldet";
 }
 public void Run(CancellationToken cancel,Action<string> status){
  while(!cancel.IsCancellationRequested){
   uint app=0,line=0;IntPtr b=IntPtr.Zero;var calls=new HashSet<uint>();
   try{
    using(var processes=new ProcessList()){if(!processes.HasStarface){status("abgemeldet");cancel.WaitHandle.WaitOne(2000);continue;}}
    uint count,version=0x20002;Init init=new Init{Total=(uint)Marshal.SizeOf(typeof(Init)),Options=2};Check(lineInitializeExW(out app,IntPtr.Zero,IntPtr.Zero,"CuraAed Telefonstatus",out count,ref version,ref init));
    if(count>4096)throw new InvalidOperationException("Zu viele Leitungen.");b=Marshal.AllocHGlobal(65536);
    uint selected=0,api=0;int matches=0;
    for(uint id=0;id<count;id++){uint v;Ext ext;if(lineNegotiateAPIVersion(app,id,0x20000,0x20002,out v,out ext)<0)continue;Marshal.WriteInt32(b,0,65536);Check(lineGetDevCapsW(app,id,v,0,b));if(Provider(b).IndexOf("STARFACE",StringComparison.OrdinalIgnoreCase)<0)continue;selected=id;api=v;matches++;}
    if(matches!=1)throw new InvalidOperationException("Keine eindeutige persönliche STARFACE-Leitung.");
    Check(lineOpen(app,selected,out line,api,0,UIntPtr.Zero,2,0,IntPtr.Zero));Check(lineSetStatusMessages(line,0x1ffffff,0));
    while(!cancel.IsCancellationRequested){
     Message m;for(int j=0;j<1000&&lineGetMessage(app,out m,0)==0;j++){if(m.Kind==3)throw new InvalidOperationException("Leitung geschlossen.");if(m.Kind==2)calls.Add(m.Device);}
     Marshal.WriteInt32(b,0,65536);Check(lineGetNewCalls(line,0,1,b));int used=Used(b,24),n=Marshal.ReadInt32(b,12),size=Marshal.ReadInt32(b,16),off=Marshal.ReadInt32(b,20);
     if(n<0||n>4096||size<0||off<0||off>used||size>used-off||n>size/4)throw new InvalidOperationException("Ungültige Anrufliste.");
     for(int i=0;i<n;i++)calls.Add(unchecked((uint)Marshal.ReadInt32(b,off+4*i)));
     var states=new List<uint>();foreach(uint call in new List<uint>(calls)){Marshal.WriteInt32(b,0,65536);int rc=lineGetCallStatus(call,b);if(rc<0){calls.Remove(call);lineDeallocateCall(call);continue;}Used(b,16);uint s=unchecked((uint)Marshal.ReadInt32(b,12));if((s&1)!=0){calls.Remove(call);lineDeallocateCall(call);}else states.Add(s);}
     Marshal.WriteInt32(b,0,65536);Check(lineGetLineDevStatus(line,b));Used(b,60);
     status(Einordnen(unchecked((uint)Marshal.ReadInt32(b,56)),Marshal.ReadInt32(b,20),Marshal.ReadInt32(b,24),states));
     using(var processes=new ProcessList()){if(!processes.HasStarface){status("abgemeldet");break;}}
     cancel.WaitHandle.WaitOne(500);
    }
   }catch{status("unbekannt");cancel.WaitHandle.WaitOne(3000);}
   finally{foreach(uint c in calls)lineDeallocateCall(c);if(line!=0)lineClose(line);if(app!=0)lineShutdown(app);if(b!=IntPtr.Zero)Marshal.FreeHGlobal(b);}
  }
 }
 sealed class ProcessList:IDisposable {readonly Process[] items=Process.GetProcessesByName("STARFACE App");public bool HasStarface{get{return items.Length>0;}}public void Dispose(){foreach(var p in items)p.Dispose();}}
}
