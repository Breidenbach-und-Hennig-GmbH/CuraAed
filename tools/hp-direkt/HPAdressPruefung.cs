using System;
using System.Collections.Generic;
using System.Data.Odbc;
using System.Drawing;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Read-only diagnosis. No contact names, bank values, authentication tokens or network upload.
internal sealed class HPAddressProbe:Form
{
 readonly TextBox source=new TextBox{Text="HPSD",Width=120},database=new TextBox{Text="HPSERVSD",Width=140};
 readonly Button run=new Button{Text="Adressstruktur nur lesend prüfen",AutoSize=true};
 readonly TextBox status=new TextBox{Multiline=true,ReadOnly=true,Dock=DockStyle.Fill};
 static readonly string[] Tables={"AD_Adr","AD_AdrAn","AD_Bankverb","AD_SEPA_Mandat","AD_BVakt","AD_TelNr","AD_eMail","AD_eMail_Adresse_mar","AD_AnsprPart","AD_ASP_ZusatzInfo","SY_DSGVO_Aenderung"};
 static List<Dictionary<string,object>> Read(OdbcConnection c,string sql,int max){var rows=new List<Dictionary<string,object>>();using(var cmd=new OdbcCommand(sql,c)){cmd.CommandTimeout=30;using(var r=cmd.ExecuteReader())while(rows.Count<max&&r.Read()){var row=new Dictionary<string,object>();for(int i=0;i<r.FieldCount;i++)row[r.GetName(i)]=r.IsDBNull(i)?null:Convert.ToString(r.GetValue(i),System.Globalization.CultureInfo.InvariantCulture).TrimEnd(' ');rows.Add(row);}}return rows;}
 internal HPAddressProbe(){Text="CuraAed - HP-Adressprüfung (nur lesend)";Width=850;Height=500;var bar=new FlowLayoutPanel{Dock=DockStyle.Top,Height=125,Padding=new Padding(12)};bar.Controls.Add(new Label{Text="ODBC-Quelle",AutoSize=true});bar.Controls.Add(source);bar.Controls.Add(new Label{Text="Datenbank",AutoSize=true});bar.Controls.Add(database);bar.SetFlowBreak(database,true);bar.Controls.Add(new Label{Text="Zeilenzahlen, Felddefinitionen, Nummernzähler, Anlagezeiten und Protokollschlüssel. Keine Änderungen und keine Internetübertragung.",AutoSize=true});bar.SetFlowBreak(bar.Controls[bar.Controls.Count-1],true);bar.Controls.Add(run);Controls.Add(status);Controls.Add(bar);run.Click+=delegate{Check();};}
 void Check(){
  if(!Regex.IsMatch(source.Text,@"\A[A-Za-z0-9_-]{1,64}\z")||!Regex.IsMatch(database.Text,@"\A[A-Za-z0-9_-]{1,64}\z")){status.Text="Datenquelle und Datenbank prüfen.";return;}
  using(var save=new SaveFileDialog{Filter="JSON-Bericht|*.json",FileName="HP-Neuanlagepruefung.json",OverwritePrompt=true}){
   if(save.ShowDialog(this)!=DialogResult.OK)return;run.Enabled=false;
   try{var b=new OdbcConnectionStringBuilder();b.Dsn=source.Text;var report=new Dictionary<string,object>{{"format","curaaed-hp-address-probe-v2"},{"nur_lesend",true},{"datenbank",database.Text.ToUpperInvariant()},{"erstellt_utc",DateTime.UtcNow.ToString("o")}};
    using(var c=new OdbcConnection(b.ConnectionString)){c.Open();if(!String.Equals(c.Database,database.Text,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Datenbank passt nicht zur gewählten Quelle.");
     var counts=new Dictionary<string,object>();foreach(string table in Tables)try{counts[table]=Read(c,"SELECT COUNT(*) AS Anzahl FROM "+table,1);}catch(OdbcException e){counts[table]=new{fehler=e.Errors.Count>0?e.Errors[0].SQLState:"ODBC"};}report["tabellen"]=counts;
     report["adressbestand"]=Read(c,"SELECT MIN(AdrNr) AS Erste,MAX(AdrNr) AS Letzte,COUNT(*) AS Anzahl FROM AD_Adr",1);
     report["neue_adressen_seit_test"]=Read(c,"SELECT COUNT(*) AS Anzahl FROM AD_Adr WHERE AdrNr>65940",1);
     report["nummernvergabe"]=Read(c,"SELECT Init,SY_AdrNr FROM SY_LfdNum",10);
     report["protokoll_module"]=Read(c,"SELECT Modul,Modul_ID,Bezeichnung FROM SY_DSGVO_Modul",500);
     report["protokoll_kennungen"]=Read(c,"SELECT DISTINCT MODUL,MODUL_ID FROM SY_DSGVO_Aenderung",500);
     report["protokoll_neueste_kennungen"]=Read(c,"SELECT MODUL,MODUL_ID,Typ FROM SY_DSGVO_Aenderung ORDER BY lfdNr DESC",20);
     report["neuanlage_protokollschluessel"]=Read(c,"SELECT Datum,Uhrzeit,lfdNr,UTCZeit,SB,Typ,MODUL_ID,IDX,IDX1n,IDXnm,IDXff FROM SY_DSGVO_Aenderung WHERE MODUL='ADR' AND MODUL_ID='NEUANL' ORDER BY lfdNr DESC",20);
     report["neuanlage_sb"]=Read(c,"SELECT * FROM AD_AdrAn ORDER BY AdrNr DESC",20);
     report["felder"]=Read(c,"SELECT Xf$Name,Xe$Name,Xe$DataType,Xe$Size FROM X$Field,X$File WHERE Xe$File=Xf$Id AND (Xf$Name LIKE 'AD_%' OR Xf$Name LIKE 'SY_DSGVO%' OR Xf$Name='SY_LfdNum') ORDER BY Xf$Name,Xe$Offset",5000);
    }
    File.WriteAllText(save.FileName,new JavaScriptSerializer{MaxJsonLength=4*1024*1024}.Serialize(report),new UTF8Encoding(false));status.Text="Adressprüfung gespeichert: "+save.FileName+Environment.NewLine+"Keine HP-Daten geändert. Keine Kontakt- oder Bankdaten übertragen.";
   }catch(Exception e){status.Text="Prüfung angehalten: "+(e is OdbcException?"ODBC-Lesezugriff fehlgeschlagen.":e.Message)+Environment.NewLine+"Keine HP-Daten geändert.";}finally{run.Enabled=true;}
  }
 }
 [STAThread]static void Main(){Application.EnableVisualStyles();Application.Run(new HPAddressProbe());}
}
