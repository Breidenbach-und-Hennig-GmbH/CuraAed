using System;
using System.Collections.Generic;
using System.Collections;
using System.Data.Odbc;
using System.Globalization;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class HPInactiveException:InvalidOperationException {}
internal sealed class HPImportSpec
{
 internal string Art,Table,Scope; internal string[] Fields,Keys;
 internal HPImportSpec(string art,string table,string scope,string fields,string keys){Art=art;Table=table;Scope=scope;Fields=fields.Split(',');Keys=keys.Split(',');}
}

internal sealed class HPObjectImportClient
{
 internal static readonly HPImportSpec[] Specs={
  new HPImportSpec("objekt","OB_Obj","ObjNr","ObjNr,Suchbegr,ObjTyp,ObjStr,Land,PLZ,Ort,Baujahr,ZustVerkauf,ZustVerm,Heizungsart,WWArt,Garagenart,M_llGefArt,ObjGr1,ObjGr2,ObjGr3,ObjGr4,ObjGr5,ObjektID,GebBezeichnung,ObjektAlias,SB,Team,Objekttyp2,Objektstrasse_2,BuchhalterDesh,BuchhalterReserve,ObjTypText,Zustellpostamt,VSchlFREI,anzeigen_ja_nein","ObjNr"),
  new HPImportSpec("objektzahlen","OB_AnzGeb","ObjNr","ObjNr,AnzGeb,AnzEin","ObjNr"),
  new HPImportSpec("gebaeude","OB_Gebaude","ObjNr","IndGeb,BezGeb","IndGeb"),
  new HPImportSpec("jahr","FI_ObjBJ","FIBJ_Obj","FIBJ_BJ,FIBJ_BjVon,FIBJ_BjBis,FIBJ_gebBis,FIBJ_SB,FIBJ_Wahrung,FIBJ_VorstAbzQuote","FIBJ_BJ"),
  new HPImportSpec("einheit","WG_Wohnung","ObjNr","WhgNr,SuchBegr,WhgLage,IndGeb,IndBauteil,WhgTyp,WG_VSchl1,WG_VSchl2,WG_VSchl3,WG_VSchl4,WG_VSchl5,Whg_JN,GewEinhJN,TeilEigJN,BewKat,MwStoptJN,gefJN,MittelGetilgtJN,BindBis,WG_VwArt,WG_m2Fl,WG_GarNr,WG_StellPlNr,MEA,gilt_bis_Datum,Datum_Frei,MI_MinolFolgeNrHeizA,MIMinolWhgNr,DTA_OrdBgr13,CB_mit_Text_Frei,CB_mit_Text_Frei_1,CB_mit_Text_Frei_2","WhgNr"),
  new HPImportSpec("funktion","PF_PFkt","ObjNr","lfdNrDatensatz,PFKt,WhgNr,DatVon,DatBis,AdrNr,KEY_Firma,Info,PKto,FI_MieterPKto,PFktArtEigMiet,ST_SchlAustriaPKto,inaktiv,inaktivBis,MobileEnde,DatOptvon,DatOptbis,DatOptausueb","lfdNrDatensatz"),
  new HPImportSpec("konto","PK_Pkto","ObjNr","PKtoNr,WhgNr,AdrNr,PKtoName,RefKtoNr,AK_Aktenzeichen","PKtoNr"),
  new HPImportSpec("schluessel","OB_VSchl","ObjNr","BJ,VerteilerSchl,Typ_PW,SchlTxt,AbrObjAntSum,TabArt,Ger_teArt","BJ,VerteilerSchl"),
  new HPImportSpec("einheitsanteil","WG_VSchl","ObjNr","Buchungsjahr,WhgNr,VSchl,WhgAnteile","Buchungsjahr,WhgNr,VSchl"),
  new HPImportSpec("kontenanteil","PK_VSchl","ObjNr","BJ,PKtoNr,VSchl,AntPers","BJ,PKtoNr,VSchl"),
  new HPImportSpec("personenwert","PK_VSchlPers","ObjNr","BJ,PKtoNr,VSchl,DatAnders,Info,AnzPers,AnzTag","BJ,PKtoNr,VSchl,DatAnders"),
  new HPImportSpec("personenjahr","PK_VSchlPersBJ","ObjNr","BJ,PKtoNr,VSchl,DatAnders,BJ_Ubergreif","BJ,PKtoNr,VSchl,DatAnders")
 };
 readonly string dsn,database,id,token;
 string sourceFingerprint;
 readonly JavaScriptSerializer json=new JavaScriptSerializer {MaxJsonLength=262144};
 internal HPObjectImportClient(string source,string db,string pairing)
 {
  if(!Regex.IsMatch(source,@"\A[A-Za-z0-9_-]{1,64}\z")||!Regex.IsMatch(db,@"\A[A-Za-z0-9_-]{1,64}\z"))throw new ArgumentException();
  var p=json.Deserialize<Dictionary<string,object>>(pairing); Guid guid;
  id=Convert.ToString(p["id"]);token=Convert.ToString(p["token"]);
  if(!Guid.TryParse(id,out guid)||!Regex.IsMatch(token,@"\A[A-Za-z0-9_-]{43}\z")||Convert.ToString(p["scope"])!="objekte-import-v1"||Convert.ToString(p["datenbank"])!=db.ToUpperInvariant())throw new ArgumentException();
  dsn=source;database=db.ToUpperInvariant();
 }
 OdbcConnection Open(){var b=new OdbcConnectionStringBuilder();b.Dsn=dsn;var c=new OdbcConnection(b.ConnectionString);try{c.Open();if(!String.Equals(c.Database,database,StringComparison.OrdinalIgnoreCase)||String.IsNullOrWhiteSpace(c.DataSource))throw new InvalidOperationException();
  string identity=Part(c.DataSource.Trim().ToUpperInvariant())+Part(c.Database.ToUpperInvariant())+Part(dsn.ToUpperInvariant())+Part(Environment.MachineName.ToUpperInvariant())+Part(System.Security.Principal.WindowsIdentity.GetCurrent().User.Value);
  string actual;using(var sha=SHA256.Create())actual=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(identity))).Replace("-","").ToLowerInvariant();
  if(sourceFingerprint==null)sourceFingerprint=actual;else if(sourceFingerprint!=actual)throw new InvalidOperationException("HP-Quelle wurde während des Imports geändert.");return c;}catch{c.Dispose();throw;}}
 internal static string Part(string v){return v==null?"-1:":Encoding.UTF8.GetByteCount(v).ToString(CultureInfo.InvariantCulture)+":"+v;}
 internal static string Key(HPImportSpec s,Dictionary<string,object> values){var b=new StringBuilder();foreach(string k in s.Keys){if(values[k]==null||Convert.ToString(values[k]).Length==0)throw new InvalidOperationException();b.Append(Part(Convert.ToString(values[k])));}return b.ToString();}
 internal static string Fingerprint(HPImportSpec s,int obj,Dictionary<string,object> values){var b=new StringBuilder(Part(s.Art));b.Append(Part(obj.ToString(CultureInfo.InvariantCulture)));foreach(string k in s.Fields)b.Append(Part(values[k]==null?null:Convert.ToString(values[k])));using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(b.ToString()))).Replace("-","").ToLowerInvariant();}
 internal static string ExpandDecimal(string v)
 {
  var m=Regex.Match(v,@"\A(-?)(\d+)(?:\.(\d+))?[Ee]([+-]?\d+)\z");if(!m.Success)return v;
  string digits=m.Groups[2].Value+m.Groups[3].Value;int point=m.Groups[2].Value.Length+Int32.Parse(m.Groups[4].Value,CultureInfo.InvariantCulture);
  if(Math.Abs(point)>64||digits.Length>64)return v;
  string result=point<=0?"0."+new string('0',-point)+digits:point>=digits.Length?digits+new string('0',point-digits.Length):digits.Insert(point,".");return m.Groups[1].Value+result;
 }
 internal static object Value(object v){if(v==null||v==DBNull.Value)return null;if(v is bool)return (bool)v?"1":"0";if(v is double){double n=(double)v;if(Double.IsNaN(n)||Double.IsInfinity(n))return n.ToString(CultureInfo.InvariantCulture);return ExpandDecimal(n.ToString("R",CultureInfo.InvariantCulture));}if(v is float)return ExpandDecimal(((float)v).ToString("R",CultureInfo.InvariantCulture));if(v is DateTime)return ((DateTime)v).ToString("o",CultureInfo.InvariantCulture);if(v is byte[])return Convert.ToBase64String((byte[])v);return Convert.ToString(v,CultureInfo.InvariantCulture).TrimEnd(' ');}
 static bool TextKey(string k){return k=="VSchl"||k=="VerteilerSchl";}
 internal static string Query(HPImportSpec s,bool after)
 {
  var fields=new List<string>();foreach(string k in s.Fields)if(k!="ObjTypText")fields.Add(k);
  string sql="SELECT "+String.Join(",",fields)+" FROM "+s.Table+" WHERE "+s.Scope+"=? AND EXISTS (SELECT 1 FROM FI_Obj WHERE FI_Obj=? AND FI_beendet=0)";
  if(after){var ors=new List<string>();for(int i=0;i<s.Keys.Length;i++){var ands=new List<string>();for(int j=0;j<i;j++)ands.Add(s.Keys[j]+"=?");ands.Add(s.Keys[i]+">?");ors.Add("("+String.Join(" AND ",ands)+")");}sql+=" AND ("+String.Join(" OR ",ors)+")";}
  return sql+" ORDER BY "+String.Join(",",s.Keys);
 }
 List<Dictionary<string,object>> Page(HPImportSpec s,int obj,Dictionary<string,object> after)
 {
  var rows=new List<Dictionary<string,object>>();using(var c=Open())using(var cmd=new OdbcCommand(Query(s,after!=null),c)){
   cmd.CommandTimeout=20;cmd.Parameters.Add("obj",OdbcType.Int).Value=obj;cmd.Parameters.Add("aktivesObjekt",OdbcType.Int).Value=obj;
   if(after!=null)for(int i=0;i<s.Keys.Length;i++)for(int j=0;j<=i;j++){string k=s.Keys[j];var p=cmd.Parameters.Add("cursor"+i+"_"+j,TextKey(k)?OdbcType.Char:OdbcType.Int);p.Value=TextKey(k)?after[k]:(object)Int32.Parse(Convert.ToString(after[k]),CultureInfo.InvariantCulture);}
   using(var r=cmd.ExecuteReader())while(rows.Count<51&&r.Read()){var values=new Dictionary<string,object>();foreach(string field in s.Fields)if(field!="ObjTypText")values.Add(field,Value(r[field]));if(s.Art=="objekt")values.Add("ObjTypText",null);if(rows.Count>0&&Key(s,rows[rows.Count-1])==Key(s,values))throw new InvalidOperationException("Doppelter HP-Quellschlüssel.");rows.Add(values);}
   if(s.Art=="objekt"&&rows.Count==1){using(var lookup=new OdbcCommand("SELECT Bezeichnung FROM GD_ObjTyp WHERE KEY_ObjTyp=?",c)){lookup.CommandTimeout=10;lookup.Parameters.Add("typ",OdbcType.Char).Value=rows[0]["ObjTyp"]??"";using(var r=lookup.ExecuteReader()){if(r.Read()){var label=Value(r[0]);if(r.Read())throw new InvalidOperationException();rows[0]["ObjTypText"]=label;}}}}
  }if(rows.Count>50)rows.RemoveAt(50);return rows;
 }
 List<int> Objects(int cursor){var result=new List<int>();using(var c=Open())using(var cmd=new OdbcCommand("SELECT ObjNr FROM OB_Obj WHERE ObjNr>? ORDER BY ObjNr",c)){cmd.CommandTimeout=20;cmd.Parameters.Add("cursor",OdbcType.Int).Value=cursor;using(var r=cmd.ExecuteReader())while(result.Count<50&&r.Read()){int n=Convert.ToInt32(r[0]);if(result.Count>0&&result[result.Count-1]>=n)throw new InvalidOperationException();result.Add(n);}}return result;}
 object Status(int obj){using(var c=Open())using(var cmd=new OdbcCommand("SELECT FI_beendet FROM FI_Obj WHERE FI_Obj=?",c)){cmd.CommandTimeout=20;cmd.Parameters.Add("obj",OdbcType.Int).Value=obj;using(var r=cmd.ExecuteReader()){if(!r.Read())return null;object value=r.IsDBNull(0)?null:(object)Convert.ToInt32(r[0]);if(r.Read())throw new InvalidOperationException();return value;}}}
 Dictionary<string,object> Post(string action,object data)
 {
  var q=(HttpWebRequest)WebRequest.Create("https://curaaed.onrender.com/api/hp-objekte/agent/"+id+"/"+action);q.Method="POST";q.AllowAutoRedirect=false;q.Timeout=30000;q.ReadWriteTimeout=30000;q.ContentType="application/json";q.Headers["Authorization"]="Bearer "+token;
  if(sourceFingerprint==null)throw new InvalidOperationException();var body=json.Deserialize<Dictionary<string,object>>(json.Serialize(data));body["quelle"]=sourceFingerprint;
  byte[] bytes=Encoding.UTF8.GetBytes(json.Serialize(body));if(bytes.Length>262144)throw new InvalidOperationException();q.ContentLength=bytes.Length;using(var stream=q.GetRequestStream())stream.Write(bytes,0,bytes.Length);
  using(var response=(HttpWebResponse)q.GetResponse())using(var reader=new StreamReader(response.GetResponseStream(),Encoding.UTF8)){var chars=new char[262145];int count=0,n;while(count<chars.Length&&(n=reader.Read(chars,count,chars.Length-count))>0)count+=n;if(count>262144)throw new InvalidOperationException();return json.Deserialize<Dictionary<string,object>>(new string(chars,0,count));}
 }
 bool Active(int obj){var result=Post("status",new{datenbank=database,objnr=obj,fi_beendet=Status(obj)});return result.ContainsKey("erlaubt")&&result["erlaubt"] is bool&&(bool)result["erlaubt"];}
 void Send(HPImportSpec s,int obj,List<Dictionary<string,object>> rows,Action<string> log)
 {
  if(!Active(obj))throw new HPInactiveException();
  var fingerprints=new List<object>();foreach(var values in rows)fingerprints.Add(new{art=s.Art,key=Key(s,values),hash=Fingerprint(s,obj,values)});
  var comparison=Post("vergleich",new{datenbank=database,objnr=obj,fingerprints});if(Convert.ToString(comparison["protokoll"])!="objekt-import-delta-v1")throw new InvalidOperationException();
  var needed=new HashSet<string>();foreach(object raw in (ArrayList)comparison["benoetigt"]){var f=(Dictionary<string,object>)raw;if(Convert.ToString(f["art"])!=s.Art||!needed.Add(Convert.ToString(f["key"])))throw new InvalidOperationException();}
  var changed=new List<object>();foreach(var values in rows)if(needed.Remove(Key(s,values)))changed.Add(new{art=s.Art,objnr=obj,werte=values});if(needed.Count>0)throw new InvalidOperationException();
  if(changed.Count>0){if(!Active(obj))throw new HPInactiveException();var result=Post("abgleich",new{datenbank=database,objnr=obj,records=changed});if(s.Art=="objekt"&&Convert.ToInt32(result["fehler"])>0)throw new InvalidOperationException();log("HP "+obj+" / "+s.Art+": "+result["neu"]+" neu, "+result["geaendert"]+" geändert, "+result["konflikt"]+" Konflikte, "+result["fehler"]+" zurückgestellt.");}
 }
 void Report(int obj,string art,string code){Post("diagnose",new{datenbank=database,objnr=obj,art,code});}
 internal async Task Run(CancellationToken stop,Action<string> log)
 {
  try{using(var c=Open()){}Post("quelle",new{datenbank=database});}
  catch(WebException e){var response=e.Response as HttpWebResponse;int code=response==null?0:(int)response.StatusCode;if(response!=null)response.Dispose();log("Start abgelehnt (HTTP "+code+"). Objektimport-Freigabe und feste HP-Quellzuordnung prüfen.");return;}
  catch(OdbcException e){log("Start angehalten: ODBC "+e.Errors[0].SQLState+". Datenquelle und Datenbank prüfen.");return;}
  catch{log("Start angehalten: Die tatsächliche ODBC-Quelle konnte nicht eindeutig bestätigt werden.");return;}
  while(!stop.IsCancellationRequested){int delay=60000;try{
   int cursor=0;while(!stop.IsCancellationRequested){var objects=Objects(cursor);if(objects.Count==0)break;
    foreach(int obj in objects){if(stop.IsCancellationRequested)return;cursor=obj;try{if(!Active(obj))continue;
     var root=Page(Specs[0],obj,null);if(root.Count!=1){log("HP "+obj+": Objektstamm nicht eindeutig; zurückgestellt.");continue;}if(Convert.ToString(root[0]["ObjTyp"])=="BKS")continue;
     Send(Specs[0],obj,root,log);
     Report(obj,"objekt",null);
     for(int i=1;i<Specs.Length;i++){var spec=Specs[i];try{Dictionary<string,object> after=null;while(!stop.IsCancellationRequested){var rows=Page(spec,obj,after);if(rows.Count==0)break;Send(spec,obj,rows,log);after=rows[rows.Count-1];if(rows.Count<50)break;await Task.Delay(150,stop);}Report(obj,spec.Art,null);}
      catch(HPInactiveException){break;}
      catch(OdbcException e){Report(obj,spec.Art,"ODBC_"+e.Errors[0].SQLState);log("HP "+obj+" / "+spec.Art+": ODBC "+e.Errors[0].SQLState+"; Bereich zurückgestellt.");}
      catch(InvalidOperationException){Report(obj,spec.Art,"QUELLE_UNKLAR");log("HP "+obj+" / "+spec.Art+": Quelldaten nicht eindeutig. Bereich zurückgestellt.");}}
    }catch(HPInactiveException){continue;}catch(OdbcException e){Report(obj,"objekt","ODBC_"+e.Errors[0].SQLState);log("HP "+obj+": ODBC "+e.Errors[0].SQLState+"; Objekt zurückgestellt.");}catch(InvalidOperationException){Report(obj,"objekt","QUELLE_UNKLAR");log("HP "+obj+": Objektstamm nicht eindeutig. Objekt zurückgestellt.");}
    }if(objects.Count<50)break;
   }log("Prüflauf beendet. Unveränderte vollständige Datensätze wurden nicht erneut übertragen.");delay=60000;
  }catch(OperationCanceledException){return;}catch(WebException e){var response=e.Response as HttpWebResponse;int code=response==null?0:(int)response.StatusCode;if(response!=null)response.Dispose();if(code==401||code==403){log("Import angehalten (HTTP "+code+"). Freigabe oder Datenbankzuordnung prüfen.");return;}log("Verbindung vorübergehend unterbrochen (HTTP "+code+"). Erneuter Versuch ohne doppelte Datensätze.");delay=15000;}
   catch(OdbcException e){log("HP-Lesen fehlgeschlagen: ODBC "+e.Errors[0].SQLState+". Keine HP-Daten geändert.");delay=60000;}
   catch{log("Import angehalten: Quelldaten oder Protokoll prüfen. Keine HP-Daten geändert.");delay=60000;}try{await Task.Delay(delay,stop);}catch(OperationCanceledException){return;}}
 }
}

internal static class HPObjectImportProfile
{
 static string FilePath {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CuraAed","HPObjektimport","verbindung.dpapi");}}
 internal static Dictionary<string,object> Load(){if(!File.Exists(FilePath))return null;return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(FilePath),null,DataProtectionScope.CurrentUser)));}
 internal static void Save(string dsn,string database,string pairing){Directory.CreateDirectory(Path.GetDirectoryName(FilePath));byte[] bytes=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(new{dsn,database,pairing}));File.WriteAllBytes(FilePath,ProtectedData.Protect(bytes,null,DataProtectionScope.CurrentUser));}
 internal static void Forget(){if(File.Exists(FilePath))File.Delete(FilePath);}
}

internal sealed class HPObjectImportForm:Form
{
 readonly TextBox dsn=new TextBox{Width=120,Text="HPSD"},db=new TextBox{Width=160,Text="HPSERVSD"},pair=new TextBox{Width=840,UseSystemPasswordChar=true};
 readonly CheckBox consent=new CheckBox{AutoSize=true,Text="Aktuelle Objekte mit Einheiten, Personenfunktionen, Personenkonten und Jahres-Verteilerschlüsseln nur lesen und nach CuraAed importieren."};
 readonly CheckBox remember=new CheckBox{AutoSize=true,Text="Verbindung für dieses Windows-Konto verschlüsselt merken"};
 readonly Button start=new Button{AutoSize=true,Text="Automatischen Import starten"},stop=new Button{AutoSize=true,Text="Import beenden",Enabled=false},forget=new Button{AutoSize=true,Text="Gespeicherte Verbindung entfernen"};
 readonly TextBox log=new TextBox{Multiline=true,ReadOnly=true,Dock=DockStyle.Fill,ScrollBars=ScrollBars.Vertical};CancellationTokenSource cancel;Task worker;bool closing;
 internal HPObjectImportForm(){Text="CuraAed – HP-Objektimport (HP nur lesend)";Width=1100;Height=650;
  var top=new FlowLayoutPanel{Dock=DockStyle.Top,Height=245,Padding=new Padding(12)};top.Controls.Add(new Label{Text="ODBC-Quelle",AutoSize=true});top.Controls.Add(dsn);top.Controls.Add(new Label{Text="HP-Datenbank",AutoSize=true});top.Controls.Add(db);top.SetFlowBreak(db,true);
  top.Controls.Add(new Label{Text="Geschützte Objektimport-Kopplung aus CuraAed (keine Adress- oder Testkopplung)",AutoSize=true});top.SetFlowBreak(top.Controls[top.Controls.Count-1],true);top.Controls.Add(pair);top.SetFlowBreak(pair,true);top.Controls.Add(consent);top.SetFlowBreak(consent,true);top.Controls.Add(remember);top.Controls.Add(forget);top.SetFlowBreak(forget,true);top.Controls.Add(start);top.Controls.Add(stop);top.SetFlowBreak(stop,true);top.Controls.Add(new Label{Text="Automatisch bei laufendem Fenster. Kein Windows-Dienst oder Autostart. Unveränderte Daten werden lokal geprüft; nur neue/geänderte Datensätze übertragen.",AutoSize=true});Controls.Add(log);Controls.Add(top);
  try{var p=HPObjectImportProfile.Load();if(p!=null){dsn.Text=Convert.ToString(p["dsn"]);db.Text=Convert.ToString(p["database"]);pair.Text=Convert.ToString(p["pairing"]);remember.Checked=true;Log("Geschützte Verbindung geladen. Importumfang prüfen und starten.");}}catch{Log("Gespeicherte Verbindung konnte nicht geladen werden.");}
  forget.Click+=delegate{try{HPObjectImportProfile.Forget();pair.Clear();remember.Checked=false;Log("Lokale Verbindung entfernt. Freigabe gegebenenfalls in CuraAed widerrufen.");}catch{Log("Lokale Verbindung konnte nicht entfernt werden.");}};
  start.Click+=async delegate{if(!consent.Checked)return;HPObjectImportClient client;try{client=new HPObjectImportClient(dsn.Text.Trim(),db.Text.Trim(),pair.Text);if(remember.Checked)HPObjectImportProfile.Save(dsn.Text.Trim(),db.Text.Trim(),pair.Text);else HPObjectImportProfile.Forget();}catch{MessageBox.Show(this,"Objektimport-Kopplung, Datenquelle und geschützte Speicherung prüfen.");return;}
   start.Enabled=false;stop.Enabled=true;dsn.Enabled=db.Enabled=pair.Enabled=consent.Enabled=remember.Enabled=forget.Enabled=false;pair.Clear();cancel=new CancellationTokenSource();worker=Task.Run(()=>client.Run(cancel.Token,Log));try{await worker;}catch{Log("Import beendet.");}finally{cancel.Dispose();cancel=null;start.Enabled=true;stop.Enabled=false;dsn.Enabled=db.Enabled=pair.Enabled=consent.Enabled=remember.Enabled=forget.Enabled=true;if(remember.Checked)try{pair.Text=Convert.ToString(HPObjectImportProfile.Load()["pairing"]);}catch{}if(closing)Close();}};
  stop.Click+=delegate{if(cancel!=null)cancel.Cancel();};FormClosing+=delegate(object s,FormClosingEventArgs e){if(worker!=null&&!worker.IsCompleted){e.Cancel=true;closing=true;if(cancel!=null)cancel.Cancel();}};
 }
 void Log(string text){if(InvokeRequired){try{BeginInvoke(new Action<string>(Log),text);}catch{}return;}if(log.Lines.Length>150)log.Clear();log.AppendText(DateTime.Now.ToString("HH:mm:ss")+" "+text+Environment.NewLine);}
 [STAThread]static void Main(){ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;Application.EnableVisualStyles();Application.Run(new HPObjectImportForm());}
}
