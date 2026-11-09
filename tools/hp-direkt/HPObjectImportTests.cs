using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;

internal static class HPObjectImportTests
{
 static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
 static HPImportSpec Spec(string art){foreach(var s in HPObjectImportClient.Specs)if(s.Art==art)return s;throw new Exception("Bereich fehlt");}
 static string Joined(object raw){var list=new List<string>();foreach(object v in (ArrayList)raw)list.Add(Convert.ToString(v));return String.Join(",",list);}
 static void Reject(Action action){bool rejected=false;try{action();}catch(ArgumentException){rejected=true;}Check(rejected,"Unzulässige Kopplung akzeptiert");}
 static void Main(string[] args)
 {
  var json=new JavaScriptSerializer();var data=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args.Length>0?args[0]:"test/fixtures/hp-import-vectoren.json"));
  Check(((ArrayList)data["datasets"]).Count==HPObjectImportClient.Specs.Length,"Abweichende Bereichszahl");
  foreach(object raw in (ArrayList)data["datasets"]){var d=(Dictionary<string,object>)raw;var s=Spec(Convert.ToString(d["art"]));Check(String.Join(",",s.Fields)==Joined(d["fields"]),"Abweichende Feldreihenfolge "+s.Art);Check(String.Join(",",s.Keys)==Joined(d["keys"]),"Abweichende Quellschlüssel");
   string sql=HPObjectImportClient.Query(s,true);Check(sql.StartsWith("SELECT ")&&sql.Contains(" WHERE "+s.Scope+"=?")&&sql.Contains("FI_beendet=0"),"Fehlende Objekt-/Aktivbindung");Check(sql.Split('?').Length-1==2+s.Keys.Length*(s.Keys.Length+1)/2,"Abweichende Cursorparameter");}
  foreach(object raw in (ArrayList)data["vectors"]){var r=(Dictionary<string,object>)raw;var s=Spec(Convert.ToString(r["art"]));var values=(Dictionary<string,object>)r["werte"];Check(HPObjectImportClient.Key(s,values)==Convert.ToString(r["key"]),"Quellschlüssel inkompatibel");Check(HPObjectImportClient.Fingerprint(s,Convert.ToInt32(r["objnr"]),values)==Convert.ToString(r["hash"]),"Fingerabdruck inkompatibel: "+s.Art);}
  Check(HPObjectImportClient.ExpandDecimal("1.25E+3")=="1250","Dezimalexponent positiv");Check(HPObjectImportClient.ExpandDecimal("-1.5E-7")=="-0.00000015","Dezimalexponent negativ");Check(Convert.ToString(HPObjectImportClient.Value(true))=="1","BIT normalisieren");Check(HPObjectImportClient.Value(DBNull.Value)==null,"NULL erhalten");
  string token=new string('x',43),id="11111111-1111-4111-8111-111111111111";
  Reject(()=>new HPObjectImportClient("HPSD","HPTEST",json.Serialize(new{id,token,scope="adressen-v1",datenbank="HPTEST"})));
  Reject(()=>new HPObjectImportClient("HPSD","HPTEST",json.Serialize(new{id,token,scope="objekte-import-v1",datenbank="FREMD"})));
  new HPObjectImportClient("HPSD","HPTEST",json.Serialize(new{id,token,scope="objekte-import-v1",datenbank="HPTEST"}));
  Console.WriteLine("HP-Objektimport: Protokoll, UTF-8/NULL-Fingerabdrücke, Objektfilter, Cursor und getrennte Kopplungen geprüft. Kein HP-Zugriff.");
 }
}
