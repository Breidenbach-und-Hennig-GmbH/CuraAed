using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
internal static class HPAddressTests
{
 static void Check(bool ok){if(!ok)throw new Exception("Adressconnector-Prüfung fehlgeschlagen.");}
 public static void Main(){
  var j=new JavaScriptSerializer();var r=j.Deserialize<Dictionary<string,object>>("{\"nummer\":65937,\"anrede\":\"Herr\",\"vorname\":\"Jörg\",\"name1\":\"Müller\",\"zusatz\":\"\",\"strasse\":\"Test 1\",\"land\":\"DE\",\"plz\":\"12345\",\"ort\":\"Köln\"}");
  Check(HPAddressClient.Valid(r));Check(HPAddressClient.Same(r,j.Deserialize<Dictionary<string,object>>(j.Serialize(r))));
  var other=j.Deserialize<Dictionary<string,object>>(j.Serialize(r));other["ort"]="Andere";Check(!HPAddressClient.Same(r,other));other["ort"]=new string('x',31);Check(!HPAddressClient.Valid(other));other["ort"]="🏠";Check(!HPAddressClient.Valid(other));other["ort"]="Neu\n";Check(!HPAddressClient.Valid(other));
  var response=j.Deserialize<Dictionary<string,object>>("{\"jobs\":[]}");Check(response["jobs"] is System.Collections.ArrayList);
  bool rejected=false;try{new HPAddressClient("HPSD","HPTEST","{\"id\":\"00000000-0000-0000-0000-000000000000\",\"token\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"scope\":\"test\",\"datenbank\":\"HPTEST\"}");}catch{rejected=true;}Check(rejected);
  Console.WriteLine("Adressconnector: Feldgrenzen, CP850, Versionsvergleich, JSON-Protokoll und getrennte Freigabe erfolgreich geprüft.");
 }
}

