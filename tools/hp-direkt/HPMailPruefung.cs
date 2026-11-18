using System;
using System.Data.Odbc;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;

// Fixed SELECT-only diagnostics. No mail bodies, recipients, account profiles,
// passwords, source writes, dictionary changes or Internet requests.
internal sealed class HPMailPruefung:Form
{
 readonly TextBox number=new TextBox{Width=100},sb=new TextBox{Width=60},output=new TextBox{Multiline=true,ReadOnly=true,Dock=DockStyle.Fill,ScrollBars=ScrollBars.Both,WordWrap=false};
 readonly Button run=new Button{Text="Mailquelle nur lesend prüfen",AutoSize=true};
 internal HPMailPruefung(){Text="CuraAed - HP-Mailprüfung (nur lesend)";Width=1000;Height=620;var bar=new FlowLayoutPanel{Dock=DockStyle.Top,Height=80,Padding=new Padding(10)};bar.Controls.Add(new Label{Text="HPSD / HPSERVSD: Dateizuordnung und Mail-Schlüssel. Keine Inhalte, keine Kennwörter, keine HP-Änderungen.",AutoSize=true});bar.SetFlowBreak(bar.Controls[0],true);bar.Controls.Add(new Label{Text="HP-Mailnummer",AutoSize=true});bar.Controls.Add(number);bar.Controls.Add(new Label{Text="SB",AutoSize=true});bar.Controls.Add(sb);bar.Controls.Add(run);Controls.Add(output);Controls.Add(bar);run.Click+=async delegate{int n;if(!Valid(number.Text,sb.Text,out n)){output.Text="Bitte eine positive Mailnummer und ein bis drei Buchstaben/Ziffern als SB eingeben.";return;}run.Enabled=false;string owner=sb.Text;output.Text="Leseprüfung läuft …";try{output.Text=await Task.Run(()=>Check(n,owner));}catch(Exception e){output.Text="Leseprüfung angehalten: "+Safe(e.Message);}finally{run.Enabled=true;}};}
 internal static bool Valid(string number,string sb,out int n){return Int32.TryParse(number,NumberStyles.None,CultureInfo.InvariantCulture,out n)&&n>0&&Regex.IsMatch(sb??"",@"\A[A-Za-z0-9]{1,3}\z");}
 static string Safe(string s){s=Regex.Replace(s??"",@"(?i)(password|pwd|token)\s*=\s*[^;\s]+","$1=[entfernt]");return s.Length>260?s.Substring(0,260):s;}
 static string Error(OdbcException e){return e.Errors.Count>0?e.Errors[0].SQLState+" / "+e.Errors[0].NativeError+": "+Safe(e.Errors[0].Message):"ODBC-Fehler";}
 static string TableLocation(OdbcConnection c,string table){using(var cmd=c.CreateCommand()){cmd.CommandTimeout=10;cmd.CommandText="SELECT \"Xf$Loc\" FROM \"X$File\" WHERE \"Xf$Name\"=?";cmd.Parameters.Add("name",OdbcType.VarChar,128).Value=table;return Convert.ToString(cmd.ExecuteScalar()).TrimEnd();}}
 static string Count(OdbcConnection c,string table,string column,int number,string sb,bool literal){try{using(var cmd=c.CreateCommand()){cmd.CommandTimeout=15;cmd.CommandText="SELECT COUNT(*) FROM "+table+" WHERE \"Lfd__Nr_\"="+(literal?number.ToString(CultureInfo.InvariantCulture):"?")+" AND \""+column+"\"="+(literal?"'"+sb+"'":"?");if(!literal){cmd.Parameters.Add("n",OdbcType.Double).Value=(double)number;cmd.Parameters.Add("sb",OdbcType.VarChar,3).Value=sb;}return Convert.ToString(cmd.ExecuteScalar());}}catch(OdbcException e){return Error(e);}}
 static string Keys(OdbcConnection c,string table,string column,int number){try{using(var cmd=c.CreateCommand()){cmd.CommandTimeout=15;cmd.CommandText="SELECT \"Lfd__Nr_\",\""+column+"\" FROM "+table+" WHERE \"Lfd__Nr_\"=?";cmd.Parameters.Add("n",OdbcType.Double).Value=(double)number;var text=new StringBuilder();using(var r=cmd.ExecuteReader()){int count=0;while(r.Read()&&count++<5){string value=Convert.ToString(r.GetValue(1));text.Append("SB=["+value.Replace("\0","<NUL>")+"] HEX="+BitConverter.ToString(Encoding.UTF8.GetBytes(value))+"; ");}}return text.Length==0?"Keine Zeile zu dieser Nummer":text.ToString();}}catch(OdbcException e){return Error(e);}}
 static string Check(int number,string sb){int validated;if(!Valid(number.ToString(CultureInfo.InvariantCulture),sb,out validated))throw new InvalidOperationException("Ungültiger Schlüssel.");var text=new StringBuilder();using(var c=new OdbcConnection("DSN=HPSD")){c.Open();if(!String.Equals(c.Database,"HPSERVSD",StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("HPSD ist nicht mit HPSERVSD verbunden.");text.AppendLine("Datenbank: "+c.Database+" / Datenquelle: "+Safe(c.DataSource));text.AppendLine("Schlüssel: "+number+" / SB "+sb);text.AppendLine("Nur lesende Prüfung. Mailtexte, Empfänger und Kennwörter werden nicht ausgelesen.");
 foreach(string table in new[]{"AK_Akte","IE_Outbox","IE_OutboxNEU","IE_Outbox_Ex","IE_Inbox","IE_InboxNEU"}){text.AppendLine();string loc;try{loc=TableLocation(c,table);text.AppendLine(table+" -> "+loc);if(!String.IsNullOrEmpty(loc)&&Path.GetFileName(loc)==loc)text.AppendLine("Datei unter HP-Daten erreichbar: "+File.Exists(Path.Combine(@"H:\HP_Daten\hp\Daten",loc)));}catch(OdbcException e){text.AppendLine(table+": "+Error(e));continue;}if(table=="AK_Akte"||table.EndsWith("_Ex",StringComparison.Ordinal))continue;string col=table=="IE_Inbox"?"KEY_SB_K_rzel":"SB";text.AppendLine("Exakter Schlüssel (Parameter): "+Count(c,table,col,number,sb,false));text.AppendLine("Exakter Schlüssel (validierte Literale): "+Count(c,table,col,number,sb,true));text.AppendLine("Nummer ohne SB-Filter: "+Keys(c,table,col,number));}
 }return text.ToString();}
 [STAThread]static void Main(){Application.EnableVisualStyles();Application.Run(new HPMailPruefung());}
}
