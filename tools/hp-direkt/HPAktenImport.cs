using System;
using System.Collections;
using System.Collections.Generic;
using System.Data.Odbc;
using System.Globalization;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// One-way reader. SQL identifiers and filters come only from the embedded,
// reviewed table contract. HTTP responses cannot supply SQL or local paths.
internal sealed class HPAktenReader
{
 const string Origin="https://curaaed.onrender.com/api/hp-akten/agent/";
 readonly string dsn,database,id,token,root;
 readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=4*1024*1024};
 readonly Dictionary<string,object> specs;
 Dictionary<string,List<string>> legacy;
 string legacyGeneration,lastGeneration,lastBucket,legacyError;
 internal HPAktenReader(string archiveRoot){
  string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CuraAed","HPAdressconnector","verbindung.dpapi");
  if(!File.Exists(file)||new FileInfo(file).Length>32768)throw new InvalidOperationException("Gespeicherte HP-Adressverbindung fehlt. Zuerst den Adressabgleich für dieses Windows-Konto einrichten.");
  byte[] data=ProtectedData.Unprotect(File.ReadAllBytes(file),Encoding.UTF8.GetBytes("CuraAed.HPAddressProfile.v1"),DataProtectionScope.CurrentUser);
  var profile=json.Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(data));var pairing=json.Deserialize<Dictionary<string,object>>(Convert.ToString(profile["pairing"]));
  dsn=Convert.ToString(profile["dsn"]);database=Convert.ToString(profile["database"]).ToUpperInvariant();id=Convert.ToString(pairing["id"]);token=Convert.ToString(pairing["token"]);Guid guid;
  if(!Regex.IsMatch(dsn,@"\A[A-Za-z0-9_-]{1,64}\z")||!Regex.IsMatch(database,@"\A[A-Za-z0-9_-]{1,64}\z")||Convert.ToString(pairing["datenbank"])!=database||!Guid.TryParse(id,out guid)||!Regex.IsMatch(token,@"\A[A-Za-z0-9_-]{43}\z"))throw new InvalidOperationException("HP-Verbindung nicht gültig.");
  root=Path.GetFullPath(archiveRoot).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;if(!Directory.Exists(root))throw new InvalidOperationException("Archivordner nicht erreichbar.");
  using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("hpAktenImport.json"))using(var reader=new StreamReader(stream,Encoding.UTF8))specs=json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
 }
 Dictionary<string,object> Body(){return new Dictionary<string,object>{{"datenbank",database}};}
 internal static object Decode(JavaScriptSerializer serializer,string text){return text.TrimStart().StartsWith("[",StringComparison.Ordinal)?(object)serializer.Deserialize<ArrayList>(text):serializer.Deserialize<Dictionary<string,object>>(text);}
 object Post(string action,object data){
  var q=(HttpWebRequest)WebRequest.Create(Origin+id+"/"+action);q.Method="POST";q.AllowAutoRedirect=false;q.Timeout=120000;q.ReadWriteTimeout=120000;q.ContentType="application/json";q.Headers["Authorization"]="Bearer "+token;
  byte[] bytes=Encoding.UTF8.GetBytes(json.Serialize(data));q.ContentLength=bytes.Length;using(var s=q.GetRequestStream())s.Write(bytes,0,bytes.Length);
  using(var response=(HttpWebResponse)q.GetResponse())using(var reader=new StreamReader(response.GetResponseStream(),Encoding.UTF8)){var chars=new char[4*1024*1024+1];int count=0,n;while(count<chars.Length&&(n=reader.Read(chars,count,chars.Length-count))>0)count+=n;if(count==chars.Length)throw new InvalidOperationException("HP-Antwort zu groß.");return Decode(json,new string(chars,0,count));}
 }
 static string Quote(string field){if(!Regex.IsMatch(field,@"\A[A-Za-z0-9_]+\z"))throw new InvalidOperationException("Ungültiger Feldvertrag.");return "\""+field+"\"";}
 static Dictionary<string,object> Field(ArrayList fields,string name){foreach(Dictionary<string,object> f in fields)if(Convert.ToString(f["name"])==name)return f;throw new InvalidOperationException();}
 static void Param(OdbcCommand cmd,Dictionary<string,object> f,object value){if(Convert.ToInt32(f["typ"])==0)cmd.Parameters.Add("p",OdbcType.VarChar,Math.Max(Convert.ToInt32(f["max"]),1)).Value=Convert.ToString(value);else cmd.Parameters.Add("p",OdbcType.Int).Value=Convert.ToInt32(value,CultureInfo.InvariantCulture);}
 List<Dictionary<string,object>> Page(string bucket,ArrayList cursor){
  if(!specs.ContainsKey(bucket))throw new InvalidOperationException("Unbekannter HP-Lesebereich.");var p=(Dictionary<string,object>)specs[bucket];var fields=(ArrayList)p["fields"];var keys=(ArrayList)p["keys"];var columns=new List<string>();foreach(Dictionary<string,object> f in fields)columns.Add(Quote(Convert.ToString(f["name"])));
  string table=Convert.ToString(p["table"]);Quote(table);var where=new List<string>();if(Convert.ToString(p["filter"])!="")where.Add("("+Convert.ToString(p["filter"])+")");
  var b=new OdbcConnectionStringBuilder();b.Dsn=dsn;var rows=new List<Dictionary<string,object>>();using(var c=new OdbcConnection(b.ConnectionString)){c.Open();if(!String.Equals(c.Database,database,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("HP-Datenbank stimmt nicht mit der gespeicherten Verbindung überein.");using(var cmd=c.CreateCommand()){
   if(cursor.Count>0){if(cursor.Count!=keys.Count)throw new InvalidOperationException("Ungültige Leseposition.");var terms=new List<string>();for(int i=0;i<keys.Count;i++){var parts=new List<string>();for(int k=0;k<=i;k++){string key=Convert.ToString(keys[k]);parts.Add(Quote(key)+(k==i?">?":"=?"));Param(cmd,Field(fields,key),cursor[k]);}terms.Add("("+String.Join(" AND ",parts)+")");}where.Add("("+String.Join(" OR ",terms)+")");}
   var order=new List<string>();foreach(object key in keys)order.Add(Quote(Convert.ToString(key)));cmd.CommandText="SELECT "+String.Join(",",columns)+" FROM "+table+(where.Count>0?" WHERE "+String.Join(" AND ",where):"")+" ORDER BY "+String.Join(",",order);cmd.CommandTimeout=120;
   using(var r=cmd.ExecuteReader())while(rows.Count<100&&r.Read()){var row=new Dictionary<string,object>();foreach(Dictionary<string,object> f in fields){string name=Convert.ToString(f["name"]);object value=r[name];row[name]=value==DBNull.Value?null:Convert.ToString(value,CultureInfo.InvariantCulture).TrimEnd(' ');}rows.Add(row);}
  }}return rows;
 }
 internal static string BoundPath(string archiveRoot,string relative,string name){
  string root=Path.GetFullPath(archiveRoot).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
  if(String.IsNullOrEmpty(name)||Path.GetFileName(name)!=name||Path.IsPathRooted(relative)||relative.IndexOf(':')>=0)throw new InvalidOperationException("Archivpfad nicht zulässig.");
  string file=Path.GetFullPath(Path.Combine(root,relative,name));if(!file.StartsWith(root,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Archivpfad verlässt den freigegebenen Archivordner.");
  if(File.Exists(file)&&(File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("Dateiverknüpfung nicht automatisch verfolgen.");string current=Path.GetDirectoryName(file);while(current.Length>=root.TrimEnd(Path.DirectorySeparatorChar).Length){if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new InvalidOperationException("Archiv-Verzeichnisverknüpfung nicht automatisch verfolgen.");if(String.Equals(current,root.TrimEnd(Path.DirectorySeparatorChar),StringComparison.OrdinalIgnoreCase))break;current=Path.GetDirectoryName(current);}
  return file;
 }
 void LegacyIndex(string generation,CancellationToken stop,Action<string> log){
  if(legacyGeneration==generation){if(legacyError!=null)throw new InvalidOperationException(legacyError);if(legacy!=null)return;}legacy=new Dictionary<string,List<string>>(StringComparer.OrdinalIgnoreCase);legacyGeneration=generation;legacyError=null;
  try{
  var names=Post("altnamen",Body()) as ArrayList;if(names==null)throw new InvalidOperationException("Altarchivliste nicht lesbar.");foreach(object value in names){string name=Convert.ToString(value);if(Path.GetFileName(name)==name&&!legacy.ContainsKey(name))legacy[name]=new List<string>();}if(legacy.Count==0)return;
  log("Altarchiv: Dateinamen im freigegebenen Archivordner einmalig suchen.");var dirs=new Stack<string>();dirs.Push(root);int count=0;
  while(dirs.Count>0){stop.ThrowIfCancellationRequested();string folder=dirs.Pop();if((File.GetAttributes(folder)&FileAttributes.ReparsePoint)!=0)continue;foreach(string file in Directory.EnumerateFiles(folder)){if(++count>2500000)throw new InvalidOperationException("Altarchivsuche überschreitet die Prüfgrenze.");if((File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)continue;string name=Path.GetFileName(file),baseName=Path.GetFileNameWithoutExtension(file);foreach(string key in new[]{name,baseName}){List<string> list;if(legacy.TryGetValue(key,out list)&&list.Count<2&&!list.Contains(file))list.Add(file);}}foreach(string sub in Directory.EnumerateDirectories(folder))if((File.GetAttributes(sub)&FileAttributes.ReparsePoint)==0)dirs.Push(sub);}
  }catch(OperationCanceledException){legacy=null;throw;}catch{legacyError="Altarchivsuche nicht vollständig möglich. Keine ungeprüfte Dateiauswahl.";throw new InvalidOperationException(legacyError);}
 }
 void Result(string generation,Dictionary<string,object> f,string state,string message,string code){var body=Body();body["generation"]=generation;body["datei"]=f["datei_id"];body["status"]=state;body["meldung"]=message;body["code"]=code;Post("dateistatus",body);}
 void Upload(string generation,Dictionary<string,object> f,string file,FileInfo before){
  if(before.Length<1||before.Length>64*1024*1024)throw new InvalidOperationException("Dateigröße außerhalb der Übernahmegrenze (64 MB).");
  byte[] bytes=File.ReadAllBytes(file);var after=new FileInfo(file);if(before.Length!=after.Length||before.LastWriteTimeUtc.Ticks!=after.LastWriteTimeUtc.Ticks||bytes.LongLength!=before.Length)throw new InvalidOperationException("Quelldatei während des Lesens verändert.");
  string sha;using(var h=SHA256.Create())sha=BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();
  var q=(HttpWebRequest)WebRequest.Create(Origin+id+"/datei/"+Convert.ToInt64(f["datei_id"]).ToString(CultureInfo.InvariantCulture));q.Method="POST";q.AllowAutoRedirect=false;q.Timeout=600000;q.ReadWriteTimeout=600000;q.ContentType="application/octet-stream";q.Headers["Authorization"]="Bearer "+token;q.Headers["X-HP-Datenbank"]=database;q.Headers["X-HP-Generation"]=generation;q.Headers["X-HP-Groesse"]=bytes.Length.ToString(CultureInfo.InvariantCulture);q.Headers["X-HP-Mtime"]=before.LastWriteTimeUtc.Ticks.ToString(CultureInfo.InvariantCulture);q.Headers["X-HP-Sha256"]=sha;q.ContentLength=bytes.Length;using(var stream=q.GetRequestStream())stream.Write(bytes,0,bytes.Length);using(var response=(HttpWebResponse)q.GetResponse()){if(response.StatusCode!=HttpStatusCode.OK)throw new InvalidOperationException("CuraAed hat die Datei nicht bestätigt.");}
 }
 internal async Task Run(CancellationToken stop,Action<string> log){
  while(!stop.IsCancellationRequested){try{var plan=(Dictionary<string,object>)Post("abholen",Body());string status=Convert.ToString(plan["status"]);
   if(status=="fertig"){log("Durchlauf beendet. Meldungen und fehlende Zuordnungen in CuraAed prüfen.");return;}
   if(status=="angehalten"||status=="fehler"){log("Übernahme in CuraAed angehalten. Dort prüfen und fortsetzen.");return;}
   if(status=="metadaten"){string bucket=Convert.ToString(plan["bereich"]);lastGeneration=Convert.ToString(plan["generation"]);lastBucket=bucket;var rows=Page(bucket,(ArrayList)plan["cursor"]);var body=Body();body["generation"]=plan["generation"];body["bereich"]=bucket;body["cursor"]=plan["cursor"];body["zeilen"]=rows;body["fertig"]=rows.Count==0;Post("seite",body);log(bucket+": "+rows.Count+" Datensätze gelesen und von CuraAed bestätigt.");continue;}
   if(status=="dateien"){string generation=Convert.ToString(plan["generation"]);foreach(Dictionary<string,object> f in (ArrayList)plan["dateien"]){stop.ThrowIfCancellationRequested();try{var data=(Dictionary<string,object>)f["daten"];string file,name=Convert.ToString(data["AR_Dateiname"]);if(data.ContainsKey("legacy")&&Convert.ToBoolean(data["legacy"])){LegacyIndex(generation,stop,log);List<string> list;if(!legacy.TryGetValue(name,out list)||list.Count!=1)throw new InvalidOperationException("Altarchivdatei fehlt oder ist mehrfach vorhanden; keine automatische Auswahl.");file=BoundPath(root,Path.GetDirectoryName(list[0].Substring(root.Length))??"",Path.GetFileName(list[0]));}else file=BoundPath(root,Convert.ToString(data["AR_Pfad_ab__ARCHIV_"]),name);
    var info=new FileInfo(file);if(!info.Exists)throw new FileNotFoundException();
    if(Convert.ToString(f["status"])=="gesichert"&&Convert.ToInt64(f["groesse"])==info.Length&&Convert.ToString(f["mtime"])==info.LastWriteTimeUtc.Ticks.ToString(CultureInfo.InvariantCulture)){var body=Body();body["generation"]=generation;body["datei"]=f["datei_id"];body["status"]="unveraendert";body["groesse"]=info.Length;body["mtime"]=f["mtime"];Post("dateistatus",body);}else Upload(generation,f,file,info);log("Archivdatei in CuraAed bestätigt.");
   }catch(WebException e){var response=e.Response as HttpWebResponse;int code=response==null?0:(int)response.StatusCode;if(response!=null)response.Dispose();if(code==507){Result(generation,f,"fehler","Archivspeicher voll; Datei noch nicht übernommen.","speicher");return;}if(code==401||code==403||code==0)throw;Result(generation,f,"fehler",code==409?"Quelldatei verändert oder Auftrag nicht aktuell. Vorhandene Sicherung bleibt erhalten.":"Dateiübertragung nicht bestätigt (HTTP "+code+").","datei");}
   catch(OperationCanceledException){throw;}
   catch(Exception e){Result(generation,f,"fehler",e is FileNotFoundException?"Datei im HP-Archiv nicht gefunden.":e is UnauthorizedAccessException?"Keine Leseberechtigung für die HP-Archivdatei.":e is InvalidOperationException?e.Message:"HP-Archivdatei konnte nicht gelesen werden.","datei");}}continue;}
   log(status=="zuordnen"?"CuraAed baut Akten- und Archivzuordnungen auf.":"In CuraAed die direkte Aktenübernahme für diese HP-Verbindung starten.");await Task.Delay(status=="zuordnen"?150:3000,stop);
  }catch(OperationCanceledException){return;}catch(WebException e){var response=e.Response as HttpWebResponse;int code=response==null?0:(int)response.StatusCode;if(response!=null)response.Dispose();if(code==401||code==403||code==409){log("Übernahme angehalten (HTTP "+code+"). HP-Verbindung und Importstand in CuraAed prüfen.");return;}log("Verbindung unterbrochen. Bestätigte Leseposition bleibt erhalten; erneuter Versuch folgt.");if(stop.WaitHandle.WaitOne(5000))return;}catch(OdbcException e){string message="HP-Lesezugriff fehlgeschlagen: "+lastBucket+" / "+(e.Errors.Count>0?e.Errors[0].SQLState:"ODBC")+". Fortschritt bleibt erhalten.";log(message);try{var body=Body();body["generation"]=lastGeneration;body["meldung"]=message;Post("fehler",body);}catch{}return;}catch(Exception e){log("Übernahme angehalten: "+(e is InvalidOperationException?e.Message:"Lokale Leseprüfung fehlgeschlagen.")+" Keine HP-Daten geändert.");return;}}
 }
}
internal sealed class HPAktenImportForm:Form
{
 readonly TextBox archive=new TextBox{Text=@"H:\HP_Daten\hp\Daten\Archiv",Width=460},output=new TextBox{Multiline=true,ReadOnly=true,Dock=DockStyle.Fill,ScrollBars=ScrollBars.Vertical};
 readonly Button start=new Button{Text="Lesende Übernahme starten / fortsetzen",AutoSize=true},stop=new Button{Text="Anhalten",Enabled=false,AutoSize=true};CancellationTokenSource cancel;
 internal HPAktenImportForm(){Text="CuraAed - HP-Aktenimport (nur lesend)";Width=880;Height=520;var top=new FlowLayoutPanel{Dock=DockStyle.Top,Height=130,Padding=new Padding(12)};top.Controls.Add(new Label{Text="Akten, Zuordnungen, Handwerkeraufträge und Archivdateien nach CuraAed übernehmen. Keine Änderungen in HausPerfekt.",AutoSize=true});top.SetFlowBreak(top.Controls[0],true);top.Controls.Add(new Label{Text="HP-Archivordner",AutoSize=true});top.Controls.Add(archive);top.SetFlowBreak(archive,true);top.Controls.Add(start);top.Controls.Add(stop);Controls.Add(output);Controls.Add(top);start.Click+=async delegate{try{var reader=new HPAktenReader(archive.Text);start.Enabled=false;stop.Enabled=true;archive.Enabled=false;cancel=new CancellationTokenSource();await Task.Run(()=>reader.Run(cancel.Token,Log));}catch(Exception e){Log(e is InvalidOperationException?e.Message:"Gespeicherte Verbindung konnte nicht gelesen werden. Adressabgleich für dieses Windows-Konto prüfen.");}finally{if(cancel!=null){cancel.Dispose();cancel=null;}start.Enabled=true;stop.Enabled=false;archive.Enabled=true;}};stop.Click+=delegate{if(cancel!=null)cancel.Cancel();};FormClosing+=delegate(object s,FormClosingEventArgs e){if(cancel!=null){e.Cancel=true;cancel.Cancel();Log("Leseschritt wird angehalten; anschließend Fenster schließen.");}};}
 void Log(string text){if(InvokeRequired){try{BeginInvoke(new Action<string>(Log),text);}catch{}return;}if(output.Lines.Length>120)output.Clear();output.AppendText(DateTime.Now.ToString("HH:mm:ss")+" "+text+Environment.NewLine);}
 [STAThread]static void Main(){ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;Application.EnableVisualStyles();Application.Run(new HPAktenImportForm());}
}
