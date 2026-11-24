using System;
public static class TapiTests {
 static void Check(string wanted,uint flags,int active,int held,params uint[] states){if(TapiMonitor.Einordnen(flags,active,held,states)!=wanted)throw new Exception("Falscher Telefonstatus: "+wanted);}
 public static int Main(){
  Check("angemeldet",5,0,0);Check("abgemeldet",0,0,0);Check("abgemeldet",1,0,0);
  Check("telefoniert",5,1,0,256);Check("telefoniert",5,0,1,1024);Check("telefoniert",5,1,0,16);
  Check("unbekannt",5,1,0);Check("unbekannt",5,1,0,2);Check("unbekannt",5,0,0,32768);
  Check("angemeldet",5,0,0,16384,1);Check("telefoniert",5,2,0,16384,256);
  Console.WriteLine("TAPI-Zustände geprüft.");return 0;
 }
}
