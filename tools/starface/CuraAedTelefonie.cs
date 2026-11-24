using System;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class CuraAedTelefonie:Form {
 readonly TextBox url=new TextBox(),key=new TextBox{UseSystemPasswordChar=true};
 readonly Label result=new Label{AutoSize=false},userInfo=new Label{AutoSize=false};
 readonly Button start=new Button{Text="Verbinden"},stop=new Button{Text="Trennen"};
 readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer{Interval=1000};
 readonly NotifyIcon tray=new NotifyIcon{Text="CuraAed Telefonstatus",Icon=SystemIcons.Information,Visible=true};
 readonly string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CuraAed","Telefonie.dat");
 readonly HttpClient client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(8)};
 CancellationTokenSource cancel;Task monitor;bool sending;string sent="",endpoint,token;volatile string state="unbekannt";DateTime last=DateTime.MinValue;
 [STAThread]public static void Main(){bool first;using(var mutex=new Mutex(true,"Local\\CuraAedTelefonie-"+System.Security.Principal.WindowsIdentity.GetCurrent().User.Value,out first)){if(!first){MessageBox.Show("Der CuraAed-Telefonstatus läuft bereits im Infobereich.");return;}Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new CuraAedTelefonie());}}
 public CuraAedTelefonie(){
  Text="CuraAed – persönlicher Telefonstatus";ClientSize=new Size(470,250);MinimumSize=MaximumSize=Size;Font=new Font("Segoe UI",9);StartPosition=FormStartPosition.CenterScreen;
  var label=new Label{Text="CuraAed-Adresse",Left=12,Top=14,Width=135};url.SetBounds(150,12,305,24);
  var label2=new Label{Text="Persönlicher Schlüssel",Left=12,Top=48,Width=135};key.SetBounds(150,46,305,24);
  userInfo.Text="Den Schlüssel in CuraAed unter Mein Profil → Telefonie erzeugen. Er erlaubt nur die Meldung Ihres eigenen Telefonstatus. Keine Rufnummern oder Gesprächsinhalte werden übertragen.";userInfo.SetBounds(12,82,443,63);
  result.SetBounds(12,150,443,45);start.SetBounds(235,205,105,28);stop.SetBounds(350,205,105,28);stop.Enabled=false;
  Controls.AddRange(new Control[]{label,url,label2,key,userInfo,result,start,stop});
  start.Click+=async(s,e)=>await Connect();stop.Click+=async(s,e)=>await Disconnect();timer.Tick+=async(s,e)=>await Send();tray.DoubleClick+=(s,e)=>{Show();WindowState=FormWindowState.Normal;Activate();};
  var menu=new ContextMenuStrip();menu.Items.Add("Öffnen",null,(s,e)=>{Show();Activate();});menu.Items.Add("Beenden",null,(s,e)=>Close());tray.ContextMenuStrip=menu;
  Resize+=(s,e)=>{if(WindowState==FormWindowState.Minimized)Hide();};
  FormClosing+=(s,e)=>{timer.Stop();if(cancel!=null)cancel.Cancel();tray.Visible=false;};
  FormClosed+=(s,e)=>{client.Dispose();tray.Dispose();};
  try{if(File.Exists(file)){var config=new JavaScriptSerializer().Deserialize<Config>(Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(file),null,DataProtectionScope.CurrentUser)));url.Text=config.Url;key.Text=config.Token;result.Text="Gespeicherte persönliche Kopplung geladen. Zum Start Verbinden wählen.";}}catch{result.Text="Die gespeicherte Kopplung konnte nicht gelesen werden. Bitte neu koppeln.";}
 }
 async Task Connect(){
  Uri parsed;if(!Uri.TryCreate(url.Text.Trim(),UriKind.Absolute,out parsed)||parsed.Scheme!="https"||parsed.UserInfo!=""||parsed.Query!=""||parsed.Fragment!=""||parsed.AbsolutePath!="/"){result.Text="Bitte nur die HTTPS-Adresse Ihrer CuraAed-Installation eingeben.";return;}
  string candidate=key.Text.Trim();if(!System.Text.RegularExpressions.Regex.IsMatch(candidate,"\\A[a-f0-9]{64}\\z")){result.Text="Bitte den persönlichen Schlüssel aus CuraAed eingeben.";return;}
  endpoint=parsed.GetLeftPart(UriPartial.Authority)+"/api/telefonie/status";token=candidate;start.Enabled=false;url.Enabled=key.Enabled=false;result.Text="Kopplung wird geprüft …";
  try{
   await Post("unbekannt");Directory.CreateDirectory(Path.GetDirectoryName(file));File.WriteAllBytes(file,ProtectedData.Protect(Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(new Config{Url=parsed.GetLeftPart(UriPartial.Authority),Token=token})),null,DataProtectionScope.CurrentUser));
   cancel=new CancellationTokenSource();CancellationToken ct=cancel.Token;state="unbekannt";sent="";last=DateTime.MinValue;monitor=Task.Run(()=>new TapiMonitor().Run(ct,s=>state=s));stop.Enabled=true;timer.Start();await Send();
  }catch(Exception e){result.Text=e.Message;start.Enabled=true;url.Enabled=key.Enabled=true;}
 }
 async Task Post(string status){
  using(var request=new HttpRequestMessage(HttpMethod.Post,endpoint)){request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",token);request.Content=new StringContent(new JavaScriptSerializer().Serialize(new {status=status}),Encoding.UTF8,"application/json");using(var response=await client.SendAsync(request)){if(response.StatusCode==HttpStatusCode.Unauthorized)throw new InvalidOperationException("Kopplung abgelaufen oder widerrufen. Bitte in CuraAed neu koppeln.");if(!response.IsSuccessStatusCode)throw new InvalidOperationException("CuraAed hat die Statusmeldung nicht angenommen ("+(int)response.StatusCode+").");}}
 }
 async Task Send(){
  if(sending||cancel==null||cancel.IsCancellationRequested)return;string current=state;if(current==sent&&DateTime.UtcNow-last<TimeSpan.FromSeconds(15))return;sending=true;
  try{await Post(current);sent=current;last=DateTime.UtcNow;result.Text="Telefonstatus: "+current+" · an CuraAed übertragen um "+DateTime.Now.ToString("HH:mm:ss");}
  catch(Exception e){result.Text="Übertragung fehlgeschlagen. "+e.Message;last=DateTime.UtcNow;}
  finally{sending=false;}
 }
 async Task Disconnect(){
  timer.Stop();if(cancel!=null){cancel.Cancel();if(monitor!=null)await monitor;}while(sending)await Task.Delay(50);try{if(!string.IsNullOrEmpty(token))await Post("abgemeldet");}catch{}cancel=null;start.Enabled=true;stop.Enabled=false;url.Enabled=key.Enabled=true;result.Text="Lokale Übertragung angehalten. Die gespeicherte Kopplung bleibt erhalten.";
 }
 public sealed class Config {public string Url{get;set;}public string Token{get;set;}}
}
