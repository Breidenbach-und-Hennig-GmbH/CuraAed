using System;
using System.Collections.Generic;
using System.Data.Odbc;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Fixed, read-only diagnostic queries. No UPDATE/INSERT/DELETE, credentials,
// Internet access, archive copying or recursive directory enumeration.
internal sealed class HPAktenProbe:Form
{
 readonly Button run=new Button{Text="Aktenstruktur nur lesend prüfen",AutoSize=true},copy=new Button{Text="Bericht kopieren",AutoSize=true,Enabled=false};
 readonly TextBox output=new TextBox{Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Both,Dock=DockStyle.Fill,WordWrap=false};
 string report;
 internal HPAktenProbe(){Text="CuraAed - HP-Aktenprüfung (nur lesend)";Width=900;Height=570;var bar=new FlowLayoutPanel{Dock=DockStyle.Top,Height=95,Padding=new Padding(10)};bar.Controls.Add(new Label{Text="HPSD / HPSERVSD: Zeilenzahlen, Aktennummern und begrenzte Zuordnungs-/Archivbeispiele. Keine HP-Änderung, keine Internetübertragung.",AutoSize=true});bar.SetFlowBreak(bar.Controls[0],true);bar.Controls.Add(run);bar.Controls.Add(copy);Controls.Add(output);Controls.Add(bar);run.Click+=async delegate{run.Enabled=false;copy.Enabled=false;output.Text="Leseprüfung läuft …";try{report=await Task.Run(()=>Check());string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),"HP-Aktenpruefung.json");File.WriteAllText(file,report,new UTF8Encoding(false));output.Text="Bericht gespeichert: "+file+Environment.NewLine+report;copy.Enabled=true;}catch(Exception e){output.Text="Prüfung angehalten: "+e.Message+Environment.NewLine+"Keine HP-Daten geändert.";}finally{run.Enabled=true;}};copy.Click+=delegate{if(report!=null)Clipboard.SetText(report);};}
 static List<Dictionary<string,object>> Read(OdbcConnection c,string sql,int max){var rows=new List<Dictionary<string,object>>();using(var cmd=new OdbcCommand(sql,c)){cmd.CommandTimeout=30;using(var r=cmd.ExecuteReader())while(rows.Count<max&&r.Read()){var row=new Dictionary<string,object>();for(int i=0;i<r.FieldCount;i++)row[r.GetName(i)]=r.IsDBNull(i)?null:Convert.ToString(r.GetValue(i),System.Globalization.CultureInfo.InvariantCulture).TrimEnd(' ');rows.Add(row);}}return rows;}
 static object Safe(OdbcConnection c,string sql,int max){try{return Read(c,sql,max);}catch(OdbcException e){return new{fehler=e.Errors.Count>0?e.Errors[0].SQLState:"ODBC"};}}
 static string Check(){var report=new Dictionary<string,object>{{"format","curaaed-hp-akten-probe-v1"},{"nur_lesend",true},{"datenbank","HPSERVSD"},{"erstellt_utc",DateTime.UtcNow.ToString("o")}};using(var c=new OdbcConnection("DSN=HPSD")){c.Open();if(!String.Equals(c.Database,"HPSERVSD",StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Datenbank stimmt nicht mit HPSERVSD überein.");
 var counts=new Dictionary<string,object>();foreach(string table in new[]{"AK_Akte","AK_AdrAkt","AK_AktFolgeblatt","HW_Auftr","HW_Adressaten","HW_Txt","SY_Archiv","SY_Dateiarchiv","SY_Dokumentarchiv","GD_AktStat"})counts[table]=Safe(c,"SELECT COUNT(*) AS Anzahl FROM "+table,1);report["zeilenzahlen"]=counts;
 report["akten_schluessel"]=Safe(c,"SELECT AktNr,laufAkt,ObjNr,WhgNr,Stat,angelegt,geschlossen FROM AK_Akte ORDER BY AktNr,laufAkt",10);
 report["akte_118334"]=Safe(c,"SELECT AktNr,laufAkt,SuchBegr,ObjNr,WhgNr,Stat,Firma,SB,angelegt,geschlossen,AblageOrt,AblAkt,Zugriff,AnzZugAdr,Sonderleistung FROM AK_Akte WHERE AktNr=118334",10);
 report["adressen_118334"]=Safe(c,"SELECT Akten_Nr_,laufende_Akte,Lfd__Nr,PFkt,Adress_Nr_,Objekt_Nr,Wohnungs_Nr FROM AK_AdrAkt WHERE Akten_Nr_=118334",20);
 report["hwa_118334"]=Safe(c,"SELECT HWANr,AktNr,LaufAkt,HWAStat,HWAdrNr,ObjNr,WhgNr,Dat,Termin,erledigt FROM HW_Auftr WHERE AktNr=118334",10);
 report["archiv_118334"]=Safe(c,"SELECT AR_DOS_Dateiname,AR_Akten_Nr,AR_Laufende_Akte,AR_HWA_Nr,AR_AdrNr,AR_Objekt_Nr,AR_WhgNr,AR_Datum,AR_Dateiart FROM SY_Archiv WHERE AR_Akten_Nr=118334",10);
 report["dateiarchiv_beispiele"]=Safe(c,"SELECT AR_ArchivNr,AR_ArchivLfdNr,AR_Dateiname,AR_Pfad_ab__ARCHIV_,AR_Datei_vorhanden,AR_Revisionspfad FROM SY_Dateiarchiv ORDER BY AR_ArchivNr DESC,AR_ArchivLfdNr",5);
 report["dokumentarchiv_beispiele"]=Safe(c,"SELECT AR_ArchivNr,AR_SysDatum,AR_SysZeit,AR_Name FROM SY_Dokumentarchiv ORDER BY AR_ArchivNr DESC",5);
 report["archiv_beispiele"]=Safe(c,"SELECT AR_DOS_Dateiname,AR_Akten_Nr,AR_Laufende_Akte,AR_HWA_Nr,AR_Datum,AR_Dateiart FROM SY_Archiv WHERE AR_Akten_Nr>0",5);
 report["aktenstati"]=Safe(c,"SELECT KEY_Akten_Status,Bezeichnung FROM GD_AktStat",500);
 }
 report["archivordner_vorhanden"]=Directory.Exists(@"H:\HP_Daten\hp\Daten\Archiv");return new JavaScriptSerializer{MaxJsonLength=4*1024*1024}.Serialize(report);}
 [STAThread]static void Main(){Application.EnableVisualStyles();Application.Run(new HPAktenProbe());}
}
