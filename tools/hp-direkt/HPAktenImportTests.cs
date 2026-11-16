using System;
using System.IO;
internal static class HPAktenImportTests
{
 static void Require(bool value){if(!value)throw new Exception("HP archive boundary check failed");}
 static void Rejected(Action action){bool failed=false;try{action();}catch{failed=true;}Require(failed);}
 static int Main(){string root=Path.Combine(Path.GetTempPath(),"curaaed-akten-path-test-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);Directory.CreateDirectory(Path.Combine(root,"2026"));try{Require(HPAktenReader.BoundPath(root,"2026","Schaden.pdf")==Path.Combine(root,"2026","Schaden.pdf"));Rejected(()=>HPAktenReader.BoundPath(root,"..","outside.pdf"));Rejected(()=>HPAktenReader.BoundPath(root,@"C:\Windows","outside.pdf"));Rejected(()=>HPAktenReader.BoundPath(root,"",@"..\outside.pdf"));Rejected(()=>HPAktenReader.BoundPath(root,"",""));var serializer=new System.Web.Script.Serialization.JavaScriptSerializer();var parsed=(System.Collections.Generic.Dictionary<string,object>)HPAktenReader.Decode(serializer,"{\"cursor\":[],\"dateien\":[{\"a\":1}]}");Require(parsed["cursor"] is System.Collections.ArrayList);Require(parsed["dateien"] is System.Collections.ArrayList);Require(HPAktenReader.Decode(serializer,"[\"file\"]") is System.Collections.ArrayList);Console.WriteLine("HP archive path boundaries verified.");return 0;}finally{Directory.Delete(root,true);}}
}
