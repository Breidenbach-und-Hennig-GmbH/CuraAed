using System;
using System.Collections.Generic;
using System.Data.Odbc;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using System.Web.Script.Serialization;

// Ausschließlich Metadaten aus dem Zen-Datenkatalog. Keine HP-Stammdaten,
// Buchungen, Konten, Kennwörter oder automatische Internetübertragung.
internal sealed class HPStructureForm:Form
{
 readonly TextBox dsn=new TextBox{Width=120,Text="HPSD"},database=new TextBox{Width=160,Text="HPSERVSD"};
 readonly CheckBox consent=new CheckBox{AutoSize=true,Text="Nur Tabellen- und Felddefinitionen dieser HP-Datenbank lokal prüfen."};
 readonly Button run=new Button{AutoSize=true,Text="Strukturbericht erstellen"};
 readonly TextBox status=new TextBox{Multiline=true,ReadOnly=true,Dock=DockStyle.Fill};
 internal HPStructureForm(){Text="CuraAed – HP-Strukturprüfung (nur lesend)";Width=900;Height=470;
  var top=new FlowLayoutPanel{Dock=DockStyle.Top,Height=150,Padding=new Padding(12)};
  top.Controls.Add(new Label{Text="ODBC-Quelle",AutoSize=true});top.Controls.Add(dsn);top.Controls.Add(new Label{Text="HP-Datenbank",AutoSize=true});top.Controls.Add(database);top.SetFlowBreak(database,true);top.Controls.Add(consent);top.SetFlowBreak(consent,true);top.Controls.Add(run);Controls.Add(status);Controls.Add(top);
  run.Click+=delegate{if(!consent.Checked)return;if(!Regex.IsMatch(dsn.Text,@"\A[A-Za-z0-9_-]{1,64}\z")||!Regex.IsMatch(database.Text,@"\A[A-Za-z0-9_-]{1,64}\z")){status.Text="Datenquelle prüfen.";return;}
   using(var dialog=new SaveFileDialog{Filter="JSON-Strukturbericht|*.json",FileName="CuraAed-HP-Strukturbericht.json",OverwritePrompt=true}){if(dialog.ShowDialog(this)!=DialogResult.OK)return;run.Enabled=false;try{
    var builder=new OdbcConnectionStringBuilder();builder.Dsn=dsn.Text;var fields=new List<Dictionary<string,object>>();
    using(var c=new OdbcConnection(builder.ConnectionString)){c.Open();if(!String.Equals(c.Database,database.Text,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException();
     using(var cmd=new OdbcCommand("SELECT Xf$Name, Xe$Name, Xe$DataType, Xe$Size, Xe$Offset FROM X$Field, X$File WHERE Xe$File=Xf$Id ORDER BY Xf$Name, Xe$Offset",c)){cmd.CommandTimeout=60;using(var r=cmd.ExecuteReader()){while(r.Read()){if(fields.Count>=250000)throw new InvalidOperationException();fields.Add(new Dictionary<string,object>{{"tabelle",Convert.ToString(r[0]).TrimEnd(' ')},{"feld",Convert.ToString(r[1]).TrimEnd(' ')},{"typ",Convert.ToInt32(r[2])},{"bytes",Convert.ToInt32(r[3])},{"offset",Convert.ToInt32(r[4])}});}}}
    }
    var json=new JavaScriptSerializer{MaxJsonLength=32*1024*1024};File.WriteAllText(dialog.FileName,json.Serialize(new{format="curaaed-hp-metadata-v1",datenbank=database.Text.ToUpperInvariant(),erstellt_utc=DateTime.UtcNow.ToString("o"),nur_metadaten=true,felder=fields}),new UTF8Encoding(false));status.Text=fields.Count+" Felddefinitionen lokal gespeichert. Keine HP-Daten geändert und nichts ins Internet übertragen.";
   }catch{status.Text="Strukturprüfung fehlgeschlagen. Datenbankzuordnung und ODBC-Leserecht prüfen. Keine HP-Daten geändert.";}finally{run.Enabled=true;}}
  };
 }
 [STAThread]static void Main(){Application.EnableVisualStyles();Application.Run(new HPStructureForm());}
}

