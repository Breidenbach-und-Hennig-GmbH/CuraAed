using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Odbc;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Testconnector: ausschließlich ein separat angelegter CURAAED-TEST und Titel.
// Keine Installation, keine Passwortspeicherung, keine beliebigen SQL-Befehle.
internal sealed class HPDirectClient
{
    internal const string AppOrigin = "https://curaaed.onrender.com";
    internal const string TestName = "CURAAED-TEST";
    readonly string dsn, database, id, token;
    readonly int number;
    readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = 8192 };
    internal HPDirectClient(string dsn, string database, int number, string pairing)
    {
        if (!SimpleName(dsn) || !SimpleName(database) || number < 1) throw new ArgumentException("DSN, Datenbank und Testnummer prüfen.");
        var p = json.Deserialize<Dictionary<string, object>>(pairing);
        Guid parsed;
        if (p == null || !p.ContainsKey("id") || !p.ContainsKey("token")) throw new ArgumentException("CuraAed-Kopplungsdaten fehlen.");
        id = Convert.ToString(p["id"]); token = Convert.ToString(p["token"]);
        if (!Guid.TryParse(id, out parsed) || !Regex.IsMatch(token, @"\A[A-Za-z0-9_-]{43}\z")) throw new ArgumentException("CuraAed-Kopplungsdaten ungültig.");
        this.dsn = dsn; this.database = database.ToUpperInvariant(); this.number = number;
    }
    internal static bool SimpleName(string value) { return value != null && Regex.IsMatch(value, @"\A[A-Za-z0-9_-]{1,64}\z"); }
    internal static bool ValidTitle(string value) { return value != null && Regex.IsMatch(value, @"\A[\x20-\x7e]{0,30}\z") && !value.EndsWith(" ",StringComparison.Ordinal); }
    internal static bool Binding(int expected, int actual, string name) { return expected == actual && name == TestName; }
    internal static bool CompareTitle(string current, string expected) { return String.Equals(current, expected, StringComparison.Ordinal); }
    OdbcConnection Open()
    {
        var b = new OdbcConnectionStringBuilder(); b.Dsn = dsn;
        var c = new OdbcConnection(b.ConnectionString);
        try { c.Open(); if (!String.Equals(c.Database, database, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("HP-Datenbank stimmt nicht mit der lokalen Freigabe überein."); return c; }
        catch { c.Dispose(); throw; }
    }
    Dictionary<string, object> Read(OdbcConnection connection, OdbcTransaction transaction)
    {
        using (var command = new OdbcCommand("SELECT AdrNr, Name1, Titel FROM AD_Adr WHERE AdrNr=? AND Name1=?", connection))
        {
            command.Transaction = transaction; command.CommandTimeout = 10;
            command.Parameters.Add("id", OdbcType.Int).Value = number;
            command.Parameters.Add("name", OdbcType.Char, 30).Value = TestName;
            using (var r = command.ExecuteReader())
            {
                if (!r.Read()) throw new InvalidOperationException("Vereinbarter Testkontakt fehlt.");
                int actual = Convert.ToInt32(r["AdrNr"]);
                string name = Convert.ToString(r["Name1"]).TrimEnd(' '), title = Convert.ToString(r["Titel"]).TrimEnd(' ');
                if (!Binding(number, actual, name) || r.Read()) throw new InvalidOperationException("Testkontakt nicht eindeutig.");
                return new Dictionary<string, object> { {"nummer",actual},{"name",name},{"titel",title} };
            }
        }
    }
    Dictionary<string, object> Write(string oldTitle, string newTitle)
    {
        if (!ValidTitle(oldTitle) || !ValidTitle(newTitle) || oldTitle == newTitle) return Result("fehler", null);
        bool commitStarted = false;
        using (var c = Open())
        {
            OdbcTransaction tx = null;
            try
            {
                tx = c.BeginTransaction(IsolationLevel.Serializable);
                var current = Read(c, tx);
                if (!CompareTitle(Convert.ToString(current["titel"]), oldTitle))
                {
                    tx.Rollback(); tx.Dispose(); tx = null;
                    return Result("konflikt", current);
                }
                using (var command = new OdbcCommand("UPDATE AD_Adr SET Titel=? WHERE AdrNr=? AND Name1=? AND Titel=?", c, tx))
                {
                    command.CommandTimeout = 10;
                    command.Parameters.Add("newTitle", OdbcType.Char, 30).Value = newTitle;
                    command.Parameters.Add("id", OdbcType.Int).Value = number;
                    command.Parameters.Add("name", OdbcType.Char, 30).Value = TestName;
                    command.Parameters.Add("oldTitle", OdbcType.Char, 30).Value = oldTitle;
                    if (command.ExecuteNonQuery() != 1) throw new InvalidOperationException("HP-Testkontakt wurde nicht eindeutig geändert.");
                }
                if (!CompareTitle(Convert.ToString(Read(c, tx)["titel"]), newTitle)) throw new InvalidOperationException("HP-Titel nicht bestätigt.");
                commitStarted = true; tx.Commit(); tx.Dispose(); tx = null;
                var after = Read(c, null);
                return CompareTitle(Convert.ToString(after["titel"]), newTitle) ? Result("erfolg", after) : Result("unklar", null);
            }
            catch
            {
                bool rolledBack = false;
                if (tx != null) { try { tx.Rollback(); rolledBack = true; } catch {} }
                return Result(!commitStarted && rolledBack ? "fehler" : "unklar", null);
            }
            finally { if (tx != null) tx.Dispose(); }
        }
    }
    static Dictionary<string, object> Result(string status, Dictionary<string, object> record)
    {
        var result = new Dictionary<string, object> { {"status",status} };
        if (record != null) result.Add("record",record);
        return result;
    }
    Dictionary<string, object> Post(string action, object body)
    {
        var request = (HttpWebRequest)WebRequest.Create(AppOrigin + "/api/hp-direkt/agent/" + id + "/" + action);
        request.Method = "POST"; request.AllowAutoRedirect = false; request.Timeout = 15000; request.ReadWriteTimeout = 15000;
        request.ContentType = "application/json"; request.Accept = "application/json"; request.Headers["Authorization"] = "Bearer " + token;
        byte[] bytes = Encoding.UTF8.GetBytes(json.Serialize(body)); request.ContentLength = bytes.Length;
        using (var stream = request.GetRequestStream()) stream.Write(bytes,0,bytes.Length);
        using (var response = (HttpWebResponse)request.GetResponse())
        {
            if (response.StatusCode != HttpStatusCode.OK) throw new InvalidOperationException("CuraAed hat die Anfrage nicht bestätigt.");
            using (var reader = new StreamReader(response.GetResponseStream(),Encoding.UTF8))
            {
                char[] chars = new char[8193]; int count = 0, n;
                while (count < chars.Length && (n = reader.Read(chars,count,chars.Length-count)) > 0) count += n;
                if (count > 8192) throw new InvalidOperationException("Connector-Antwort zu groß.");
                return json.Deserialize<Dictionary<string,object>>(new string(chars,0,count));
            }
        }
    }
    internal async Task Run(CancellationToken stop, Action<string> log)
    {
        // Vor dem ersten Netzaufruf lokale Kundenzuordnung prüfen.
        using (var c = Open()) Read(c,null);
        log("Lokaler Testkontakt bestätigt. Verbindung zu CuraAed wird hergestellt.");
        Dictionary<string,object> pending = null;
        while (!stop.IsCancellationRequested || pending != null)
        {
            try
            {
                if (pending != null)
                {
                    Post("ergebnis",pending); pending = null;
                    log("Rückmeldung von CuraAed bestätigt. Wartet auf nächsten Testauftrag.");
                    if (stop.IsCancellationRequested) return;
                }
                var response = Post("poll",new {datenbank=database,test_nummer=number,test_name=TestName});
                object raw;
                if (response.TryGetValue("auftrag",out raw) && raw != null)
                {
                    var job = raw as Dictionary<string,object>; Guid guid;
                    if (job == null || !Guid.TryParse(Convert.ToString(job["id"]),out guid) || !Binding(number,Convert.ToInt32(job["nummer"]),Convert.ToString(job["name"]))) throw new InvalidOperationException("Fremden Auftrag abgelehnt.");
                    string art = Convert.ToString(job["art"]);
                    log(art == "titel" ? "Freigegebene Titeländerung wird einmalig verarbeitet." : "Testkontakt wird frisch aus HP gelesen.");
                    try
                    {
                        if (art == "lesen") { using (var c = Open()) pending = Result("erfolg",Read(c,null)); }
                        else if (art == "titel") pending = Write(Convert.ToString(job["alt"]),Convert.ToString(job["neu"]));
                        else pending = Result("fehler",null);
                    }
                    catch { pending = Result("fehler",null); }
                    pending.Add("id",Convert.ToString(job["id"])); pending.Add("claim",Convert.ToString(job["claim"]));
                    log("HP-Ergebnis: " + pending["status"] + ". Sende Rückmeldung; SQL wird nicht wiederholt.");
                    continue;
                }
                log("Mit CuraAed verbunden. Wartet auf Testauftrag.");
            }
            catch (WebException e)
            {
                var response = e.Response as HttpWebResponse;
                int code = response == null ? 0 : (int)response.StatusCode;
                if (response != null) response.Dispose();
                if (code == 401 || code == 403 || code == 409 || code == 404)
                { log("CuraAed hat die Verbindung abgelehnt oder beendet. Kein erneuter SQL-Versuch."); return; }
                log(pending != null ? "Rückmeldung ausstehend. Es wird nur die Rückmeldung erneut gesendet, nicht die Änderung." : "CuraAed nicht erreichbar. Warte auf Verbindung.");
            }
            // Beim Beenden genau einen bereits vorliegenden Bericht noch senden;
            // keine neue Abfrage und keine erneute Ausführung eines HP-Auftrags.
            if (stop.IsCancellationRequested) return;
            try { await Task.Delay(3000,stop); } catch (TaskCanceledException) { return; }
        }
    }
}

internal sealed class HPDirectForm : Form
{
    readonly TextBox dsn = new TextBox { Width=120 }, database = new TextBox { Width=140 }, number = new TextBox { Width=100 };
    readonly TextBox pairing = new TextBox { Multiline=true,Width=700,Height=70,ScrollBars=ScrollBars.Vertical };
    readonly CheckBox consent = new CheckBox { AutoSize=true,Text="Lesen und Titel-Rückschreibung ausschließlich für diesen CURAAED-TEST freigeben." };
    readonly Button start = new Button { Text="Mit CuraAed verbinden",AutoSize=true }, stopButton = new Button { Text="Verbindung beenden",AutoSize=true,Enabled=false };
    readonly TextBox log = new TextBox { Multiline=true,ReadOnly=true,Dock=DockStyle.Fill,ScrollBars=ScrollBars.Vertical,Font=new Font("Consolas",10) };
    CancellationTokenSource cancellation; Task worker; bool closing;
    public HPDirectForm()
    {
        Text="CuraAed – direkter HP-Testconnector"; Width=1000;Height=700; StartPosition=FormStartPosition.CenterScreen;
        var top=new FlowLayoutPanel {Dock=DockStyle.Top,Height=245,Padding=new Padding(12)};
        top.Controls.Add(new Label {Text="ODBC-Quelle",AutoSize=true});top.Controls.Add(dsn);
        top.Controls.Add(new Label {Text="HP-Datenbank",AutoSize=true});top.Controls.Add(database);
        top.Controls.Add(new Label {Text="Testnummer",AutoSize=true});top.Controls.Add(number);top.SetFlowBreak(number,true);
        top.Controls.Add(new Label {Text="Einmalig angezeigte Kopplungsdaten aus CuraAed (JSON)",AutoSize=true});top.SetFlowBreak(top.Controls[top.Controls.Count-1],true);
        top.Controls.Add(pairing);top.SetFlowBreak(pairing,true);top.Controls.Add(consent);top.SetFlowBreak(consent,true);
        top.Controls.Add(start);top.Controls.Add(stopButton);top.SetFlowBreak(stopButton,true);
        top.Controls.Add(new Label {Text="Ziel: https://curaaed.onrender.com · läuft nur bei geöffnetem Fenster · keine Installation und keine Speicherung des Tokens",AutoSize=true});
        Controls.Add(log);Controls.Add(top);
        start.Click += async delegate
        {
            int n; HPDirectClient client;
            if(!consent.Checked || !Int32.TryParse(number.Text,out n)) { MessageBox.Show(this,"Testnummer und begrenzte Freigabe prüfen.");return; }
            try { client=new HPDirectClient(dsn.Text.Trim(),database.Text.Trim(),n,pairing.Text); }
            catch { MessageBox.Show(this,"Bitte gültige CuraAed-Kopplungsdaten und lokale Datenquelle angeben.");return; }
            start.Enabled=false; stopButton.Enabled=true; dsn.Enabled=database.Enabled=number.Enabled=pairing.Enabled=consent.Enabled=false; pairing.Clear();
            cancellation=new CancellationTokenSource();
            worker=Task.Run(()=>client.Run(cancellation.Token,WriteLog));
            try {await worker;}catch {WriteLog("Connector beendet: lokale Zuordnung oder Verbindung konnte nicht sicher geprüft werden.");}
            finally {cancellation.Dispose();cancellation=null;stopButton.Enabled=false;WriteLog("Connector beendet. Für erneutes Verbinden das Fenster neu öffnen.");if(closing)Close();}
        };
        stopButton.Click += delegate { if(cancellation!=null)cancellation.Cancel();WriteLog("Beenden angefordert. Ein bereits laufender Auftrag wird noch abgeschlossen."); };
        FormClosing += delegate(object sender,FormClosingEventArgs e)
        { if(worker!=null && !worker.IsCompleted){e.Cancel=true;closing=true;if(cancellation!=null)cancellation.Cancel();WriteLog("Fenster wird nach Abschluss des laufenden Schritts geschlossen.");} };
    }
    void WriteLog(string text)
    {
        if(IsDisposed)return;
        if(InvokeRequired){try{BeginInvoke(new Action<string>(WriteLog),text);}catch(InvalidOperationException){}return;}
        if(log.Lines.Length>100)log.Clear();log.AppendText(DateTime.Now.ToString("HH:mm:ss")+" "+text+Environment.NewLine);
    }
    [STAThread] public static void Main()
    {ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new HPDirectForm());}
}

