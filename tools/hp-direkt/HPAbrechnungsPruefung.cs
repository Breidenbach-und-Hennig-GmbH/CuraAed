using System;
using System.Collections.Generic;
using System.Data.Odbc;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Quellenprüfung für die Abrechnungsautomatik. Nur SELECT; keine Netzwerkübertragung.
internal sealed class HPAbrechnungsPruefung : Form
{
 readonly TextBox quelle=new TextBox { Text="HPSD", Width=120 };
 readonly NumericUpDown objekt=new NumericUpDown { Minimum=1, Maximum=Int32.MaxValue, Value=4074, Width=90 };
 readonly NumericUpDown jahr=new NumericUpDown { Minimum=2024, Maximum=2100, Value=2025, Width=75 };
 readonly Button starten=new Button { Text="Nur lesend prüfen", AutoSize=true };
 readonly TextBox status=new TextBox { Multiline=true, ReadOnly=true, ScrollBars=ScrollBars.Vertical, Dock=DockStyle.Fill };
 readonly JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=32*1024*1024, RecursionLimit=80 };
 internal sealed class Spec {
  internal string Name,Sql;
  internal bool MitObjekt,MitJahr;
  internal Spec(string name,string sql,bool o,bool j){Name=name;Sql=sql;MitObjekt=o;MitJahr=j;}
 }
 internal static readonly Spec[] Specs={
  new Spec("Abrechnungskennzeichen", "SELECT AB_LfdNr,ObjNr,BJ,ErstAndersAm,DruckDat,Abrechnung_abschlies,Vermoegensstatus,Vermoegensuebersicht,ABRZvon,ABRZbis,WhgVon,WhgBis FROM AB_Abr WHERE BJ>=2024 ORDER BY ObjNr,BJ,AB_LfdNr",false,false),
  new Spec("Abrechnungslauf", "SELECT * FROM AB_Abr WHERE ObjNr=? AND BJ=? ORDER BY AB_LfdNr",true,true),
  new Spec("Konten", "SELECT FI_Obj,BJ,FI_KtoNr,FI_KtoName,FI_KtoArt,FI_KtoArt2,FI_EBWertSH,FI_Soll,FI_Haben,FI_EBWertVerb FROM FI_Obj_Kto WHERE FI_Obj=? AND BJ=? ORDER BY FI_KtoNr",true,true),
  new Spec("Abgrenzungen", "SELECT * FROM FI_AbgrKto WHERE ObjNr=? AND BJ=? ORDER BY LfdNr,LfdNrZeile",true,true),
  new Spec("Festkonten", "SELECT * FROM FI_FestKto WHERE ObjNr=? AND BJ=?",true,true),
  new Spec("Abrechnungskonten", "SELECT * FROM AB_ObjKtoManuell WHERE FI_Obj=? AND BJ=? ORDER BY LfdNrAbrechnung,FI_KtoNr",true,true),
  new Spec("Einzelergebnisse", "SELECT * FROM AB_KSTErg WHERE Objekt_Nr=? AND Buchungsjahr=? ORDER BY erstellt,WhgNr,PKto,Konto_Nr_",true,true),
  new Spec("Einnahmen", "SELECT * FROM AB_Einnahmenkto WHERE ObjNr=? AND BJ=?",true,true),
  new Spec("Originaltabelle", "SELECT lfdNrAbr,TabelleKopfDaten FROM AB_BGH_TabelleKopf WHERE EXISTS (SELECT 1 FROM AB_Abr WHERE AB_Abr.AB_LfdNr=AB_BGH_TabelleKopf.lfdNrAbr AND AB_Abr.ObjNr=? AND AB_Abr.BJ=?)",true,true),
  new Spec("Ruecklagen", "SELECT * FROM AB_R_cklagen_Saldo WHERE EXISTS (SELECT 1 FROM AB_Abr WHERE AB_Abr.AB_LfdNr=AB_R_cklagen_Saldo.lfdNr_AB AND AB_Abr.ObjNr=? AND AB_Abr.BJ=?)",true,true),
  new Spec("Ruecklagenzuordnung", "SELECT * FROM AB_R_cklagen_Zuordnu WHERE EXISTS (SELECT 1 FROM AB_Abr WHERE AB_Abr.AB_LfdNr=AB_R_cklagen_Zuordnu.AB_lfd_Nr AND AB_Abr.ObjNr=? AND AB_Abr.BJ=?)",true,true),
  new Spec("AktivaPassivaTexte", "SELECT * FROM FI_Bez__Aktiva_Passi WHERE Objekt_Nr=? AND Buchungsjahr=?",true,true)
 };
 internal HPAbrechnungsPruefung(){
  Text="CuraAed – HP-Abrechnungsprüfung (nur lesend)";Width=940;Height=560;
  var bar=new FlowLayoutPanel { Dock=DockStyle.Top,Height=95,Padding=new Padding(10) };
  foreach(Control c in new Control[]{new Label{Text="ODBC",AutoSize=true},quelle,new Label{Text="Testobjekt",AutoSize=true},objekt,new Label{Text="Jahr",AutoSize=true},jahr,starten})bar.Controls.Add(c);
  var info=new Label{Text="Liest Abschlusskennzeichen ab 2024 und Detaildaten nur zum Testobjekt. Keine HP-Änderungen, kein Internet.",AutoSize=true};bar.SetFlowBreak(starten,true);bar.Controls.Add(info);Controls.Add(status);Controls.Add(bar);
  starten.Click+=async delegate{
   string dsn=quelle.Text.Trim();int nr=Decimal.ToInt32(objekt.Value),bj=Decimal.ToInt32(jahr.Value);
   if(!System.Text.RegularExpressions.Regex.IsMatch(dsn,@"\A[A-Za-z0-9_-]{1,64}\z")){status.Text="Bitte eine gültige ODBC-Quelle eingeben.";return;}
   starten.Enabled=false;status.Text="Prüfe die Datenquellen. Jede Tabelle wird zweimal gelesen; Änderungen werden erkannt.\r\n";
   try{
    var result=await Task.Run(()=>Pruefen(dsn,nr,bj));
    string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),"HP-Abrechnungspruefung-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+".json");
    File.WriteAllText(file,json.Serialize(result),new UTF8Encoding(false));status.AppendText("\r\nPrüfbericht gespeichert: "+file+"\r\nDie Prüfung verändert keine HausPerfekt-Daten. Fehlende Leserechte werden im Bericht ausgewiesen.");
   }catch(Exception e){status.AppendText("\r\nPrüfung abgebrochen: "+e.Message);}finally{starten.Enabled=true;}
  };
 }
 internal static object Wert(object v){
  if(v==null||v==DBNull.Value)return null;
  if(v is byte[]){if(((byte[])v).Length>1024*1024)throw new InvalidOperationException("Ein Quelldatenfeld ist größer als 1 MB.");return new Dictionary<string,object>{{"kodierung","base64"},{"wert",Convert.ToBase64String((byte[])v)}};}
  if(v is DateTime)return ((DateTime)v).ToString("o",CultureInfo.InvariantCulture);
  if(v is bool)return (bool)v?"1":"0";
  string s=v is double?((double)v).ToString("R",CultureInfo.InvariantCulture):Convert.ToString(v,CultureInfo.InvariantCulture).TrimEnd(' ');
  if(s.Length>1024*1024)throw new InvalidOperationException("Ein Quelldatenfeld ist größer als 1 MB.");return s;
 }
 internal List<Dictionary<string,object>> Lesen(OdbcConnection c,Spec s,int nr,int bj){
  var rows=new List<Dictionary<string,object>>();using(var cmd=new OdbcCommand(s.Sql,c)){
   cmd.CommandTimeout=30;if(s.MitObjekt)cmd.Parameters.Add("obj",OdbcType.Int).Value=nr;if(s.MitJahr)cmd.Parameters.Add("jahr",OdbcType.Int).Value=bj;
   using(var r=cmd.ExecuteReader())while(r.Read()){
    if(rows.Count>=20000)throw new InvalidOperationException("Mehr als 20.000 Datensätze. Kein unvollständiger Export.");
    var row=new Dictionary<string,object>();for(int i=0;i<r.FieldCount;i++)row.Add(r.GetName(i),Wert(r[i]));rows.Add(row);
   }
  }return rows;
 }
 string Hash(object x){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(Encoding.UTF8.GetBytes(json.Serialize(x)))).Replace("-","").ToLowerInvariant();}
 internal object Pruefen(string dsn,int nr,int bj){
  var b=new OdbcConnectionStringBuilder();b.Dsn=dsn;var tables=new List<object>();
  using(var c=new OdbcConnection(b.ConnectionString)){
   c.Open();if(!String.Equals(c.Database,"HPSERVSD",StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Die Quelle zeigt nicht auf HPSERVSD.");
   foreach(var s in Specs){
    try{var first=Lesen(c,s,nr,bj);var second=Lesen(c,s,nr,bj);string hash=Hash(first);bool stable=hash==Hash(second);tables.Add(new {bereich=s.Name,lesbar=true,stabil=stable,anzahl=first.Count,sha256=hash,zeilen=stable?first:null});}
    catch(OdbcException e){var errors=new List<object>();foreach(OdbcError err in e.Errors)errors.Add(new {sqlstate=err.SQLState,nummer=err.NativeError,meldung=err.Message});tables.Add(new {bereich=s.Name,lesbar=false,fehler=errors});}
    catch(Exception e){tables.Add(new {bereich=s.Name,lesbar=false,meldung=e.Message});}
   }
  }
  return new {format="curaaed-hp-abrechnungspruefung-v1",datenbank="HPSERVSD",objekt=nr,jahr=bj,nur_lesend=true,erstellt_utc=DateTime.UtcNow.ToString("o"),tabellen=tables};
 }
#if HP_AUTOTEST
 [STAThread]static int Main(){
  foreach(var s in Specs){if(!s.Sql.StartsWith("SELECT ",StringComparison.Ordinal)||s.Sql.Contains(";")||s.Sql.Contains("--"))return 1;int n=s.Sql.Split('?').Length-1;if(n!=(s.MitObjekt?1:0)+(s.MitJahr?1:0))return 2;if(s.Name!="Abrechnungskennzeichen"&&(!s.MitObjekt||!s.MitJahr))return 3;}
  if((string)Wert(true)!="1"||Wert(DBNull.Value)!=null||(string)Wert(1.25m)!="1.25")return 4;
  Console.WriteLine("12 begrenzte SELECT-Abfragen, Parameterbindung und Wertübertragung geprüft.");return 0;
 }
#else
 [STAThread]static void Main(){Application.EnableVisualStyles();Application.Run(new HPAbrechnungsPruefung());}
#endif
}
