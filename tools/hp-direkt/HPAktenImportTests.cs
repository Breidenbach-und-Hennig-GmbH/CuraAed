using System;
using System.IO;
internal static class HPAktenImportTests
{
 static void Require(bool value){if(!value)throw new Exception("HP archive boundary check failed");}
 static void Rejected(Action action){bool failed=false;try{action();}catch{failed=true;}Require(failed);}
 static void RepairChecks(string root){
  Require(HPAktenReader.SameSubject("Objekt 123 - Reparatur","Objekt 123 - Reparatur"));Require(HPAktenReader.SameSubject("  Objekt 123  Reparatur ","Objekt 123\r\nReparatur"));Require(!HPAktenReader.SameSubject("","Irgendeine Nachricht"));Require(!HPAktenReader.SameSubject("Auftrag A","Auftrag B"));string subject=new String('X',120);Require(HPAktenReader.SameSubject(subject.Substring(0,100),subject));
  string a=Path.Combine(root,"2026","Bericht.pdf"),b=Path.Combine(root,"Bericht.pdf");
  Require(HPAktenReader.SelectUnique("Bericht.pdf",new[]{a})==a);
  Require(HPAktenReader.SelectUnique("Bericht",new[]{a})==a);
  Rejected(()=>HPAktenReader.SelectUnique("Bericht.pdf",new[]{a,b}));
  Rejected(()=>HPAktenReader.SelectUnique("Bericht.pdf",new[]{Path.Combine(root,"Bericht.doc")}));
  Rejected(()=>HPAktenReader.SelectUnique("Bericht",new[]{a,Path.Combine(root,"Bericht.doc")}));
  Require(HPAktenReader.Header("Subject\r\nBcc: forged")=="Subject  Bcc: forged");
  byte[] bytes=System.Text.Encoding.UTF8.GetBytes(new String('ä',1000));using(var input=new MemoryStream(bytes))using(var output=new StringWriter()){HPAktenReader.Base64(input,output);Require(Convert.ToBase64String(bytes)==output.ToString().Replace("\r","").Replace("\n",""));}
  using(var output=new StringWriter()){HPAktenReader.MailPart(output,"<html><body>Grüße</body></html>");Require(output.ToString().Contains("text/html; charset=utf-8"));Require(output.ToString().Contains("base64"));}
 }
 static int Main(){string root=Path.Combine(Path.GetTempPath(),"curaaed-akten-path-test-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);Directory.CreateDirectory(Path.Combine(root,"2026"));try{RepairChecks(root);Require(HPAktenReader.BoundPath(root,"2026","Schaden.pdf")==Path.Combine(root,"2026","Schaden.pdf"));Rejected(()=>HPAktenReader.BoundPath(root,"..","outside.pdf"));Rejected(()=>HPAktenReader.BoundPath(root,@"C:\Windows","outside.pdf"));Rejected(()=>HPAktenReader.BoundPath(root,"",@"..\outside.pdf"));Rejected(()=>HPAktenReader.BoundPath(root,"",""));var serializer=new System.Web.Script.Serialization.JavaScriptSerializer();var parsed=(System.Collections.Generic.Dictionary<string,object>)HPAktenReader.Decode(serializer,"{\"cursor\":[],\"dateien\":[{\"a\":1}]}");Require(parsed["cursor"] is System.Collections.ArrayList);Require(parsed["dateien"] is System.Collections.ArrayList);Require(HPAktenReader.Decode(serializer,"[\"file\"]") is System.Collections.ArrayList);using(var cmd=new System.Data.Odbc.OdbcCommand()){HPAktenReader.Param(cmd,new System.Collections.Generic.Dictionary<string,object>{{"typ",7},{"max",1}},"True");Require(cmd.Parameters[0].OdbcType==System.Data.Odbc.OdbcType.Bit);Require((bool)cmd.Parameters[0].Value);}Console.WriteLine("HP archive path boundaries and boolean key binding verified.");return 0;}finally{Directory.Delete(root,true);}}
}
