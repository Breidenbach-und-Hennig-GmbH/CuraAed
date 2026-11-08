using System;
internal static class HPDirectTests
{
    public static int Main()
    {
        if(!HPDirectClient.SimpleName("HPSD") || HPDirectClient.SimpleName("HPSD;UID=admin"))throw new Exception("DSN-Begrenzung");
        if(!HPDirectClient.ValidTitle("") || !HPDirectClient.ValidTitle("CuraAed Test") || HPDirectClient.ValidTitle(new string('x',31)) || HPDirectClient.ValidTitle("Test\n") || HPDirectClient.ValidTitle("ä"))throw new Exception("Titel-Begrenzung");
        if(!HPDirectClient.Binding(65937,65937,"CURAAED-TEST") || HPDirectClient.Binding(65937,65927,"CURAAED-TEST") || HPDirectClient.Binding(65937,65937,"Kunde"))throw new Exception("Datensatzbindung");
        if(!HPDirectClient.CompareTitle("A","A") || HPDirectClient.CompareTitle("A","a"))throw new Exception("Konfliktvergleich");
        bool rejected=false;try{new HPDirectClient("HPSD","HPSERVSD",65937,"{}");}catch{rejected=true;}if(!rejected)throw new Exception("Kopplungsdaten fehlen");
        if(!HPDirectClient.Rejection(401,"Die achtstündige Connector-Freigabe ist abgelaufen.").Contains("abgelaufen"))throw new Exception("Ablaufmeldung");
        if(HPDirectClient.Rejection(401,"token:secret-test").Contains("secret-test"))throw new Exception("Fehler darf keine fremden Inhalte ausgeben");
        if(!HPDirectClient.Rejection(409,"").Contains("Zuordnungskonflikt"))throw new Exception("Zuordnungsmeldung");
        Console.WriteLine("Connector-Grenzen und sichere Ablehnungsgründe erfolgreich geprüft.");return 0;
    }
}

