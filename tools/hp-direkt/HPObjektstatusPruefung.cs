using System;
using System.Collections.Generic;
using System.Data.Odbc;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Fest begrenzte Leseprüfung: ausschließlich Statusfelder für 4010 und 4020.
// Keine Namen, Anschriften, Konten, Schreibbefehle oder Netzwerkübertragung.
internal sealed class HPObjectStatusForm : Form
{
 readonly TextBox dsn = new TextBox { Width=120, Text="HPSD" };
 readonly TextBox database = new TextBox { Width=160, Text="HPSERVSD" };
 readonly Button run = new Button { AutoSize=true, Text="Status von 4010 und 4020 lokal lesen" };
 readonly TextBox status = new TextBox { Multiline=true, ReadOnly=true, Dock=DockStyle.Fill, ScrollBars=ScrollBars.Vertical };

 internal HPObjectStatusForm()
 {
  Text="CuraAed – HP-Objektstatusprüfung (nur lesend)"; Width=900; Height=430;
  var top=new FlowLayoutPanel { Dock=DockStyle.Top, Height=145, Padding=new Padding(12) };
  top.Controls.Add(new Label { Text="ODBC-Quelle", AutoSize=true }); top.Controls.Add(dsn);
  top.Controls.Add(new Label { Text="HP-Datenbank", AutoSize=true }); top.Controls.Add(database); top.SetFlowBreak(database,true);
  var info=new Label { AutoSize=true, Text="Nur OB_Obj.anzeigen_ja_nein und FI_Obj.FI_beendet für 4010/4020. Keine Änderungen, kein Internetversand." };
  top.Controls.Add(info); top.SetFlowBreak(info,true); top.Controls.Add(run); Controls.Add(status); Controls.Add(top);
  run.Click+=delegate { ReadStatus(); };
 }

 static Dictionary<string,object> ReadOne(OdbcConnection c, int number, bool finance)
 {
  // Ausschließlich feste Bezeichner; Objektwert wird als Parameter gebunden.
  string sql=finance ? "SELECT FI_Obj, FI_beendet FROM FI_Obj WHERE FI_Obj = ?"
                     : "SELECT ObjNr, anzeigen_ja_nein FROM OB_Obj WHERE ObjNr = ?";
  var row=new Dictionary<string,object> { {"tabelle",finance?"FI_Obj":"OB_Obj"}, {"objektnummer",number}, {"feld",finance?"FI_beendet":"anzeigen_ja_nein"} };
  using(var cmd=new OdbcCommand(sql,c))
  {
   cmd.CommandTimeout=20; cmd.Parameters.Add("objekt",OdbcType.Int).Value=number;
   using(var reader=cmd.ExecuteReader())
   {
    row.Add("gefunden",reader.Read());
    if(!(bool)row["gefunden"]) return row;
    if(Convert.ToInt32(reader.GetValue(0),CultureInfo.InvariantCulture)!=number) throw new InvalidOperationException("Unerwartete Objektzuordnung.");
    row.Add("odbc_typname",reader.GetDataTypeName(1));
    object value=reader.IsDBNull(1)?null:reader.GetValue(1);
    row.Add("clr_typ",value==null?null:value.GetType().FullName);
    // Rohwert erhalten; keine erfundene Datumscodierung oder Statusinterpretation.
    if(value is byte[]) value=Convert.ToBase64String((byte[])value);
    else if(value is DateTime) value=((DateTime)value).ToString("o",CultureInfo.InvariantCulture);
    row.Add("wert",value);
    if(reader.Read()) throw new InvalidOperationException("Mehrere Statuszeilen für dieselbe Objektnummer. Zuordnung ungeklärt.");
   }
  }
  return row;
 }

 void ReadStatus()
 {
  if(!Regex.IsMatch(dsn.Text,@"\A[A-Za-z0-9_-]{1,64}\z") || !Regex.IsMatch(database.Text,@"\A[A-Za-z0-9_-]{1,64}\z")) { status.Text="Datenquelle prüfen."; return; }
  using(var dialog=new SaveFileDialog { Filter="JSON-Statusbericht|*.json", FileName="CuraAed-HP-Objektstatus-4010-4020.json", OverwritePrompt=true })
  {
   if(dialog.ShowDialog(this)!=DialogResult.OK) return;
   run.Enabled=false;
   try
   {
    var rows=new List<Dictionary<string,object>>(); var builder=new OdbcConnectionStringBuilder(); builder.Dsn=dsn.Text;
    using(var c=new OdbcConnection(builder.ConnectionString))
    {
     c.Open();
     if(!String.Equals(c.Database,database.Text,StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("ODBC-Datenbank stimmt nicht mit der erwarteten HP-Datenbank überein.");
     foreach(int number in new int[] {4010,4020}) { rows.Add(ReadOne(c,number,false)); rows.Add(ReadOne(c,number,true)); }
    }
    var json=new JavaScriptSerializer();
    var report=new { format="curaaed-hp-object-status-v1", datenbank=database.Text.ToUpperInvariant(), erstellt_utc=DateTime.UtcNow.ToString("o"), nur_lesend=true, statuswerte=rows };
    File.WriteAllText(dialog.FileName,json.Serialize(report),new UTF8Encoding(false));
    status.Text="Statusbericht lokal gespeichert. Keine HP-Daten geändert, nichts ins Internet übertragen.\r\n\r\n"+json.Serialize(rows);
   }
   catch(OdbcException ex)
   {
    var states=new List<string>(); foreach(OdbcError error in ex.Errors) states.Add(error.SQLState);
    status.Text="Leseprüfung fehlgeschlagen. ODBC-Status: "+String.Join(", ",states.ToArray())+". Kein neuer Bericht gespeichert, keine HP-Daten geändert.";
   }
   catch(InvalidOperationException ex) { status.Text=ex.Message+" Kein neuer Bericht gespeichert, keine HP-Daten geändert."; }
   catch { status.Text="Statusbericht konnte nicht erstellt werden. Datenquelle und lokalen Speicherort prüfen. Keine HP-Daten geändert."; }
   finally { run.Enabled=true; }
  }
 }
 [STAThread] static void Main() { Application.EnableVisualStyles(); Application.Run(new HPObjectStatusForm()); }
}
