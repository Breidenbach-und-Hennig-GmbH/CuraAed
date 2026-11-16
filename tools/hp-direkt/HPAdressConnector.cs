using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Odbc;
using System.Drawing;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed partial class HPAddressClient
{
 internal static readonly string[] Keys={"anrede","vorname","name1","zusatz","strasse","land","plz","ort"};
 static readonly string[] Columns={"Anrede","Vorname","Name1","Name2","Strasse","Land","PLZ","Ort"};
 static readonly int[] Sizes={30,30,30,30,30,3,6,30};
 const string Select="SELECT AdrNr,Anrede,Vorname,Name1,Name2,Strasse,Land,PLZ,Ort FROM AD_Adr";
 readonly string dsn,database,id,token;
 readonly bool full,createNew;
 readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=2097152};
 internal HPAddressClient(string source,string db,string pairing)
 {
  if(!Regex.IsMatch(source,@"\A[A-Za-z0-9_-]{1,64}\z")||!Regex.IsMatch(db,@"\A[A-Za-z0-9_-]{1,64}\z"))throw new ArgumentException();
  var p=json.Deserialize<Dictionary<string,object>>(pairing);Guid guid;
  id=Convert.ToString(p["id"]);token=Convert.ToString(p["token"]);
  if(!Guid.TryParse(id,out guid)||!Regex.IsMatch(token,@"\A[A-Za-z0-9_-]{43}\z")||(Convert.ToString(p["scope"])!="adressen-v1"&&Convert.ToString(p["scope"])!="adressen-v2"&&Convert.ToString(p["scope"])!="adressen-v3")||Convert.ToString(p["datenbank"])!=db.ToUpperInvariant())throw new ArgumentException();
  dsn=source;database=db.ToUpperInvariant();createNew=Convert.ToString(p["scope"])=="adressen-v3";full=createNew||Convert.ToString(p["scope"])=="adressen-v2";
 }
 OdbcConnection Open(){var b=new OdbcConnectionStringBuilder();b.Dsn=dsn;var c=new OdbcConnection(b.ConnectionString);try{c.Open();if(!String.Equals(c.Database,database,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException();return c;}catch{c.Dispose();throw;}}
 static Dictionary<string,object> FromReader(OdbcDataReader r){var a=new Dictionary<string,object>{{"nummer",Convert.ToInt32(r["AdrNr"])}};for(int i=0;i<Keys.Length;i++)a.Add(Keys[i],Convert.ToString(r[Columns[i]]).TrimEnd(' '));return a;}
 internal static bool Same(Dictionary<string,object> a,Dictionary<string,object> b){if(a==null||b==null||Convert.ToInt32(a["nummer"])!=Convert.ToInt32(b["nummer"]))return false;foreach(string k in Keys)if(!String.Equals(Convert.ToString(a[k]),Convert.ToString(b[k]),StringComparison.Ordinal))return false;return true;}
 internal static string Fingerprint(Dictionary<string,object> r){var text=new StringBuilder();var keys=new List<string>{"nummer"};keys.AddRange(Keys);foreach(string k in keys){string value=k=="nummer"?Convert.ToInt32(r[k]).ToString(System.Globalization.CultureInfo.InvariantCulture):Convert.ToString(r[k]);text.Append(Encoding.UTF8.GetByteCount(value).ToString(System.Globalization.CultureInfo.InvariantCulture)).Append(':').Append(value);}using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(text.ToString()))).Replace("-","").ToLowerInvariant();}
 internal static bool Valid(Dictionary<string,object> a)
 {
  if(a==null||!a.ContainsKey("nummer")||Convert.ToInt32(a["nummer"])<1)return false;
  var e=Encoding.GetEncoding(850,EncoderFallback.ExceptionFallback,DecoderFallback.ExceptionFallback);
  for(int i=0;i<Keys.Length;i++){object raw;if(!a.TryGetValue(Keys[i],out raw)||!(raw is string))return false;string v=(string)raw;if(v.Length>Sizes[i]||v!=v.TrimEnd()||Regex.IsMatch(v,@"[\x00-\x1f\x7f]"))return false;try{if(e.GetString(e.GetBytes(v))!=v)return false;}catch{return false;}}
  return true;
 }
 Dictionary<string,object> Read(OdbcConnection c,OdbcTransaction tx,int n)
 {
  using(var cmd=new OdbcCommand(Select+" WHERE AdrNr=?",c,tx)){cmd.CommandTimeout=15;cmd.Parameters.Add("n",OdbcType.Int).Value=n;using(var r=cmd.ExecuteReader()){if(!r.Read())throw new InvalidOperationException();var a=FromReader(r);if(r.Read())throw new InvalidOperationException();return a;}}
 }
 List<Dictionary<string,object>> Page(int cursor)
 {
  var rows=new List<Dictionary<string,object>>();using(var c=Open())using(var cmd=new OdbcCommand(Select+" WHERE AdrNr>? ORDER BY AdrNr",c)){cmd.CommandTimeout=30;cmd.Parameters.Add("cursor",OdbcType.Int).Value=cursor;using(var r=cmd.ExecuteReader())while(rows.Count<50&&r.Read())rows.Add(FromReader(r));}return rows;
 }
 static Dictionary<string,object> Result(string state,Dictionary<string,object> record){var r=new Dictionary<string,object>{{"status",state}};if(record!=null)r.Add("record",record);return r;}
 Dictionary<string,object> Write(Dictionary<string,object> old,Dictionary<string,object> desired)
 {
  if(!Valid(old)||!Valid(desired)||Convert.ToInt32(old["nummer"])!=Convert.ToInt32(desired["nummer"])||Same(old,desired))return Result("fehler",null);
  bool commit=false;using(var c=Open()){OdbcTransaction tx=null;try{
   tx=c.BeginTransaction(IsolationLevel.Serializable);int n=Convert.ToInt32(old["nummer"]);var current=Read(c,tx,n);
   if(!Same(current,old)){tx.Rollback();return Result("konflikt",current);}
   // Feste Feldliste und alte Werte im WHERE: keine beliebigen SQL-Befehle oder Fremdfelder.
   var sets=new List<string>();var where=new List<string>();for(int i=0;i<Keys.Length;i++){if(!String.Equals(Convert.ToString(old[Keys[i]]),Convert.ToString(desired[Keys[i]]),StringComparison.Ordinal))sets.Add(Columns[i]+"=?");where.Add("("+Columns[i]+"=?"+(Convert.ToString(old[Keys[i]])==""?" OR "+Columns[i]+" IS NULL":"")+")");}
   using(var cmd=new OdbcCommand("UPDATE AD_Adr SET "+String.Join(",",sets)+" WHERE AdrNr=? AND "+String.Join(" AND ",where),c,tx)){
    cmd.CommandTimeout=15;for(int i=0;i<Keys.Length;i++)if(!String.Equals(Convert.ToString(old[Keys[i]]),Convert.ToString(desired[Keys[i]]),StringComparison.Ordinal))cmd.Parameters.Add("new"+i,OdbcType.Char,Sizes[i]).Value=desired[Keys[i]];
    cmd.Parameters.Add("n",OdbcType.Int).Value=n;
    for(int i=0;i<Keys.Length;i++)cmd.Parameters.Add("old"+i,OdbcType.Char,Sizes[i]).Value=old[Keys[i]];
    if(cmd.ExecuteNonQuery()!=1)throw new InvalidOperationException();
   }
   if(!Same(Read(c,tx,n),desired))throw new InvalidOperationException();commit=true;tx.Commit();tx.Dispose();tx=null;
   var after=Read(c,null,n);return Same(after,desired)?Result("erfolg",after):Result("unklar",null);
  }catch{bool rollback=false;if(tx!=null)try{tx.Rollback();rollback=true;}catch{}return Result(!commit&&rollback?"fehler":"unklar",null);}finally{if(tx!=null)tx.Dispose();}}
 }
 Dictionary<string,object> Post(string action,object data)
 {
  var q=(HttpWebRequest)WebRequest.Create("https://curaaed.onrender.com/api/hp-adressen/agent/"+id+"/"+action);q.Method="POST";q.AllowAutoRedirect=false;q.Timeout=30000;q.ReadWriteTimeout=30000;q.ContentType="application/json";q.Headers["Authorization"]="Bearer "+token;
  byte[] bytes=Encoding.UTF8.GetBytes(json.Serialize(data));q.ContentLength=bytes.Length;using(var s=q.GetRequestStream())s.Write(bytes,0,bytes.Length);
  using(var response=(HttpWebResponse)q.GetResponse()){if(response.StatusCode!=HttpStatusCode.OK)throw new InvalidOperationException();using(var r=new StreamReader(response.GetResponseStream(),Encoding.UTF8)){var chars=new char[2097153];int count=0,n;while(count<chars.Length&&(n=r.Read(chars,count,chars.Length-count))>0)count+=n;if(count>2097152)throw new InvalidOperationException();return json.Deserialize<Dictionary<string,object>>(new string(chars,0,count));}}
 }
 internal async Task Run(CancellationToken stop,Action<string> log)
 {
  using(var c=Open()){}int cursor=0;var pending=new Queue<Dictionary<string,object>>();var newResults=new Queue<Dictionary<string,object>>();
  while(!stop.IsCancellationRequested){try{
   if(createNew)NewAddressStep(newResults,log);
   while(pending.Count>0){Post("ergebnis",pending.Peek());pending.Dequeue();}
   if(stop.IsCancellationRequested)return;
   var page=Page(cursor);var hashes=new List<Dictionary<string,object>>();foreach(var a in page)hashes.Add(new Dictionary<string,object>{{"nummer",a["nummer"]},{"hash",Fingerprint(a)}});
   var comparison=Post("vergleich",new{datenbank=database,fingerprints=hashes});object protocol,rawNeeded;
   if(!comparison.TryGetValue("protokoll",out protocol)||Convert.ToString(protocol)!="adress-delta-v1"||!comparison.TryGetValue("benoetigt",out rawNeeded)||!(rawNeeded is System.Collections.ArrayList))throw new InvalidOperationException();
   var needed=new HashSet<int>();foreach(object n in (System.Collections.ArrayList)rawNeeded)if(!needed.Add(Convert.ToInt32(n)))throw new InvalidOperationException();
   var changed=new List<Dictionary<string,object>>();foreach(var a in page)if(needed.Contains(Convert.ToInt32(a["nummer"])))changed.Add(a);
   if(changed.Count!=needed.Count)throw new InvalidOperationException();
   var response=changed.Count>0?Post("abgleich",new{datenbank=database,records=changed}):new Dictionary<string,object>{{"jobs",new System.Collections.ArrayList()}};
   // Alle gelieferten Aufträge erhalten genau einen Ausführungsversuch. Bei Abbruch keine SQL-Wiederholung.
   var jobs=response["jobs"] as System.Collections.ArrayList;
   if(jobs==null)throw new InvalidOperationException();
   foreach(object raw in jobs){var j=(Dictionary<string,object>)raw;Guid claim;if(!Guid.TryParse(Convert.ToString(j["id"]),out claim))throw new InvalidOperationException();
    var old=j["alt"] as Dictionary<string,object>;var desired=j["neu"] as Dictionary<string,object>;
    // Nur Adressen schreiben, die in genau dieser lokalen Leseseite enthalten waren.
    bool found=false;foreach(var a in page)if(Same(a,old)){found=true;break;}
    Dictionary<string,object> result;
    if(!found)result=Result("fehler",null);else try{result=Write(old,desired);}catch{result=Result("unklar",null);}
    result.Add("id",Convert.ToString(j["id"]));pending.Enqueue(result);log("Adressauftrag: "+result["status"]+". SQL wird nicht wiederholt.");
   }
   while(pending.Count>0){Post("ergebnis",pending.Peek());pending.Dequeue();}
   if(full&&page.Count>0)FullPage(page,log);
   cursor=page.Count<50?0:Convert.ToInt32(page[page.Count-1]["nummer"]);log("Adressabgleich verbunden; "+page.Count+" lokal geprüft, "+changed.Count+" neue/geänderte Datensätze übertragen. Nächste Seite folgt automatisch.");
   if(cursor!=0&&!stop.IsCancellationRequested)continue;
  }catch(WebException ex){var r=ex.Response as HttpWebResponse;int code=r==null?0:(int)r.StatusCode;if(r!=null)r.Dispose();if(code==401||code==403||code==404||code==409){log("Abgleich angehalten (HTTP "+code+"). Freigabe und Zuordnung in CuraAed prüfen.");return;}log("Verbindung unterbrochen. Ausstehende Ergebnisse werden erneut gemeldet; keine erneute SQL-Ausführung.");}
  catch{log("Lokaler Abgleichfehler. Keine automatische Wiederholung eines Schreibauftrags.");return;}
  try{await Task.Delay(3000,stop);}catch(TaskCanceledException){return;}
  }
  // Nach Stop nur bereits fertige Ergebnisse senden, keine neuen HP-Aufträge.
  while(pending.Count>0){Post("ergebnis",pending.Peek());pending.Dequeue();}
 }
}
internal static class HPAddressProfile
{
 static readonly byte[] Entropy=Encoding.UTF8.GetBytes("CuraAed.HPAddressProfile.v1");
 static string FileName {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CuraAed","HPAdressconnector","verbindung.dpapi");}}
 internal static byte[] Protect(string plain){return ProtectedData.Protect(Encoding.UTF8.GetBytes(plain),Entropy,DataProtectionScope.CurrentUser);}
 internal static string Unprotect(byte[] encrypted){return Encoding.UTF8.GetString(ProtectedData.Unprotect(encrypted,Entropy,DataProtectionScope.CurrentUser));}
 internal static Dictionary<string,object> Load(){if(!File.Exists(FileName))return null;var info=new FileInfo(FileName);if(info.Length>32768)throw new InvalidOperationException();var p=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(Unprotect(File.ReadAllBytes(FileName)));new HPAddressClient(Convert.ToString(p["dsn"]),Convert.ToString(p["database"]),Convert.ToString(p["pairing"]));return p;}
 internal static void Save(string source,string database,string pairing){new HPAddressClient(source,database,pairing);var bytes=Protect(new JavaScriptSerializer().Serialize(new{dsn=source,database=database,pairing=pairing}));Directory.CreateDirectory(Path.GetDirectoryName(FileName));string temporary=FileName+".new";File.WriteAllBytes(temporary,bytes);if(File.Exists(FileName))File.Replace(temporary,FileName,null);else File.Move(temporary,FileName);}
 internal static void Forget(){if(File.Exists(FileName))File.Delete(FileName);if(File.Exists(FileName+".new"))File.Delete(FileName+".new");}
}
internal sealed class HPAddressForm:Form
{
 readonly TextBox dsn=new TextBox{Width=110},db=new TextBox{Width=140},pair=new TextBox{Width=700,UseSystemPasswordChar=true};
 readonly CheckBox consent=new CheckBox{AutoSize=true,Text="Freigegebene HP-Adressen abgleichen; Vollfreigabe: Zusatzbereiche lesen. Neuanlage nur mit gesonderter CuraAed-Freigabe."};
 readonly CheckBox remember=new CheckBox{AutoSize=true,Text="Verbindung für dieses Windows-Konto verschlüsselt speichern (freiwillig)."};
 readonly Button forget=new Button{AutoSize=true,Text="Gespeicherte Verbindung entfernen"};
 readonly Button start=new Button{Text="Adressabgleich starten",AutoSize=true},stop=new Button{Text="Abgleich beenden",AutoSize=true,Enabled=false};
 readonly TextBox log=new TextBox{Multiline=true,ReadOnly=true,Dock=DockStyle.Fill,ScrollBars=ScrollBars.Vertical};CancellationTokenSource cancel;Task worker;bool closing;
 internal HPAddressForm(){Text="CuraAed – HP-Adressabgleich";Width=1000;Height=650;var top=new FlowLayoutPanel{Dock=DockStyle.Top,Height=245,Padding=new Padding(12)};
 top.Controls.Add(new Label{Text="ODBC-Quelle",AutoSize=true});top.Controls.Add(dsn);top.Controls.Add(new Label{Text="HP-Datenbank",AutoSize=true});top.Controls.Add(db);top.SetFlowBreak(db,true);
 top.Controls.Add(new Label{Text="Geschützte Kopplungsdaten aus CuraAed (JSON)",AutoSize=true});top.SetFlowBreak(top.Controls[top.Controls.Count-1],true);top.Controls.Add(pair);top.SetFlowBreak(pair,true);top.Controls.Add(consent);top.SetFlowBreak(consent,true);top.Controls.Add(remember);top.Controls.Add(forget);top.SetFlowBreak(forget,true);top.Controls.Add(start);top.Controls.Add(stop);top.SetFlowBreak(stop,true);top.Controls.Add(new Label{Text="Läuft bei geöffnetem Fenster. Dauerhafte Freigabe in CuraAed aktivieren. Kein Dienst oder Autostart.",AutoSize=true});Controls.Add(log);Controls.Add(top);
 try{var saved=HPAddressProfile.Load();if(saved!=null){dsn.Text=Convert.ToString(saved["dsn"]);db.Text=Convert.ToString(saved["database"]);pair.Text=Convert.ToString(saved["pairing"]);remember.Checked=true;Log("Verschlüsselte Verbindung geladen. Freigabe prüfen und Abgleich starten.");}}catch{Log("Gespeicherte Verbindung konnte für dieses Windows-Konto nicht geladen werden. Neu koppeln oder gespeicherte Verbindung entfernen.");}
 forget.Click+=delegate{try{HPAddressProfile.Forget();pair.Clear();remember.Checked=false;Log("Gespeicherte Verbindung entfernt. Laufende Freigabe in CuraAed bei Bedarf ebenfalls trennen.");}catch{MessageBox.Show(this,"Gespeicherte Verbindung konnte nicht entfernt werden.");}};
 start.Click+=async delegate{HPAddressClient c;if(!consent.Checked)return;try{if(pair.Text.Length==0&&remember.Checked){var saved=HPAddressProfile.Load();if(saved!=null&&dsn.Text.Trim()==Convert.ToString(saved["dsn"])&&db.Text.Trim()==Convert.ToString(saved["database"]))pair.Text=Convert.ToString(saved["pairing"]);}c=new HPAddressClient(dsn.Text.Trim(),db.Text.Trim(),pair.Text);}catch{MessageBox.Show(this,"Adresskopplung und Datenquelle prüfen. Testkopplungsdaten gelten hier nicht.");return;}try{if(remember.Checked)HPAddressProfile.Save(dsn.Text.Trim(),db.Text.Trim(),pair.Text);else HPAddressProfile.Forget();}catch{MessageBox.Show(this,"Verbindung konnte nicht sicher gespeichert oder entfernt werden. Kein Abgleich gestartet.");return;}start.Enabled=false;stop.Enabled=true;dsn.Enabled=db.Enabled=pair.Enabled=consent.Enabled=remember.Enabled=forget.Enabled=false;pair.Clear();cancel=new CancellationTokenSource();worker=Task.Run(()=>c.Run(cancel.Token,Log));try{await worker;}catch{Log("Abgleich angehalten. HP-Verbindung prüfen.");}finally{cancel.Dispose();cancel=null;stop.Enabled=false;start.Enabled=true;dsn.Enabled=db.Enabled=pair.Enabled=consent.Enabled=remember.Enabled=forget.Enabled=true;if(closing)Close();}};
 stop.Click+=delegate{if(cancel!=null)cancel.Cancel();};FormClosing+=delegate(object s,FormClosingEventArgs e){if(worker!=null&&!worker.IsCompleted){e.Cancel=true;closing=true;if(cancel!=null)cancel.Cancel();}};}
 void Log(string text){if(InvokeRequired){try{BeginInvoke(new Action<string>(Log),text);}catch{}return;}if(log.Lines.Length>100)log.Clear();log.AppendText(DateTime.Now.ToString("HH:mm:ss")+" "+text+Environment.NewLine);}
 [STAThread]static void Main(){ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;Application.EnableVisualStyles();Application.Run(new HPAddressForm());}
}
