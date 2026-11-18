using System;
internal static class HPMailPruefungTests
{
 static int Main(){int n;if(!HPMailPruefung.Valid("1234","ABC",out n)||n!=1234||HPMailPruefung.Valid("1 OR 1=1","FD",out n)||HPMailPruefung.Valid("123","F'",out n)||HPMailPruefung.Valid("0","FD",out n)||HPMailPruefung.Valid("123","ABCD",out n))throw new Exception("Mail key validation failed");Console.WriteLine("Mail diagnostic key validation passed.");return 0;}
}
