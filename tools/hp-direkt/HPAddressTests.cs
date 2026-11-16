using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
internal static class HPAddressTests
{
 static void Check(bool ok){if(!ok)throw new Exception("Adressconnector-Prüfung fehlgeschlagen.");}
 public static void Main(){
  var j=new JavaScriptSerializer();var r=j.Deserialize<Dictionary<string,object>>("{\"nummer\":65937,\"anrede\":\"Herr\",\"vorname\":\"Jörg\",\"name1\":\"Müller\",\"zusatz\":\"\",\"strasse\":\"Test 1\",\"land\":\"DE\",\"plz\":\"12345\",\"ort\":\"Köln\"}");
  Check(HPAddressClient.Valid(r));Check(HPAddressClient.Same(r,j.Deserialize<Dictionary<string,object>>(j.Serialize(r))));
  Check(HPAddressClient.Fingerprint(r)=="952062ac5ba53f2fa432a4a8bb144c4613774b205a35016de908d5e22e1ec34f");
  var other=j.Deserialize<Dictionary<string,object>>(j.Serialize(r));other["ort"]="Andere";Check(!HPAddressClient.Same(r,other));other["ort"]=new string('x',31);Check(!HPAddressClient.Valid(other));other["ort"]="🏠";Check(!HPAddressClient.Valid(other));other["ort"]="Neu\n";Check(!HPAddressClient.Valid(other));
  var response=j.Deserialize<Dictionary<string,object>>("{\"jobs\":[]}");Check(response["jobs"] is System.Collections.ArrayList);
  bool rejected=false;try{new HPAddressClient("HPSD","HPTEST","{\"id\":\"00000000-0000-0000-0000-000000000000\",\"token\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"scope\":\"test\",\"datenbank\":\"HPTEST\"}");}catch{rejected=true;}Check(rejected);
  Console.WriteLine("Adressconnector: Feldgrenzen, CP850, Versionsvergleich, JSON-Protokoll und getrennte Freigabe erfolgreich geprüft.");

  var full=new HPAddressClient("HPSD","HPTEST","{\"id\":\"00000000-0000-0000-0000-000000000000\",\"token\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"scope\":\"adressen-v3\",\"datenbank\":\"HPTEST\"}");
  var payload=new Dictionary<string,object>{{"record",r},{"sb","FD"},{"telefon","0221-1"},{"mobil","0170-2"},{"email","test@example.test"}};
  var reservation=new Dictionary<string,object>{{"nummer",65952},{"datum",739936},{"uhrzeit",40000},{"protokoll",93895L}};
  var plan=full.Expected(payload,reservation);Check(plan["stamm"].Count==1&&plan["telefon"].Count==2&&plan["email"].Count==1&&plan["protokoll"].Count==4);
  Check(Convert.ToString(plan["stamm"][0]["AdrNr"])=="65952"&&Convert.ToString(plan["anlage"][0]["anVonSB"])=="FD");
  Check(plan["suche"].Count==1&&Convert.ToString(plan["suche"][0]["AdrNr"])=="65952"&&Convert.ToString(plan["suche"][0]["SearchField"])=="MÜLLERJÖRGMÜLLER");
  Check(HPAddressClient.SearchText(new Dictionary<string,object>{{"SBegrAdr","Rupp, Mathias"},{"Vorname","Mathias"},{"Name1","Rupp"}})=="RUPPMATHIASMATHIASRUPP");
  Check(HPAddressClient.SearchText(new Dictionary<string,object>{{"SBegrAdr","CURAAED-TEST-NEU161126"},{"Name1","CURAAED-TEST-NEU161126"},{"Name2","Nur Schnittstellentest"}})=="CURAAEDTESTNEU161126CURAAEDTESTNEU161126NURSCHNITTSTELLENTEST");
  Check(HPAddressClient.SearchText(new Dictionary<string,object>{{"Name1",new string('X',300)}}).Length==255);
  Check(HPAddressForm.AutoStartRequested(new[]{"--autostart"}));Check(!HPAddressForm.AutoStartRequested(new string[0]));Check(!HPAddressForm.AutoStartRequested(new[]{"--autostart","unexpected"}));Check(!HPAddressForm.AutoStartRequested(new[]{"--other"}));
  var offline=new HPAddressClient("HP_NO_SUCH_DSN_TEST","HPTEST","{\"id\":\"00000000-0000-0000-0000-000000000000\",\"token\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"scope\":\"adressen-v1\",\"datenbank\":\"HPTEST\"}");
  using(var stop=new System.Threading.CancellationTokenSource()){bool retry=false;offline.Run(stop.Token,delegate(string message){if(message.Contains("HP-Datenquelle momentan nicht erreichbar")){retry=true;stop.Cancel();}}).GetAwaiter().GetResult();Check(retry);}
  Console.WriteLine("Autostart: expliziter Startparameter und Abbruch während einer nicht erreichbaren ODBC-Verbindung geprüft.");
  Check(Convert.ToString(plan["protokoll"][0]["MODUL_ID"])=="NEUANL"&&Convert.ToString(plan["protokoll"][3]["lfdNr"])=="93898");
  var copy=j.Deserialize<List<Dictionary<string,object>>>(j.Serialize(plan["telefon"]));copy.Reverse();Check(HPAddressClient.EqualRows(copy,plan["telefon"]));copy[0]["TelNr"]="fremd";Check(!HPAddressClient.EqualRows(copy,plan["telefon"]));
  Console.WriteLine("Neuanlage: feste Folgeeinträge, Mitarbeiterkürzel, HP-Nummer und vollständige zeilenweise Rückprüfung geprüft.");
  string synthetic="synthetic-test-credential-no-real-secret";var encrypted=HPAddressProfile.Protect(synthetic);Check(System.Text.Encoding.UTF8.GetString(encrypted).IndexOf(synthetic,StringComparison.Ordinal)<0);Check(HPAddressProfile.Unprotect(encrypted)==synthetic);encrypted[encrypted.Length-1]^=1;bool corruptRejected=false;try{HPAddressProfile.Unprotect(encrypted);}catch{corruptRejected=true;}Check(corruptRejected);Console.WriteLine("DPAPI: Windows-Kontobindung, verschlüsselter Roundtrip und beschädigte Daten geprüft.");
 }
}
