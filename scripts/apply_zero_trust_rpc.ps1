$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CredReader {
  [DllImport("Advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
  [DllImport("Advapi32.dll", EntryPoint="CredFree")]
  static extern void CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct CREDENTIAL { public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public IntPtr TargetAlias; public IntPtr UserName; }
  public static string Read(string target) {
    IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return "";
    try {
      CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      if (c.CredentialBlobSize == 0 || c.CredentialBlob == IntPtr.Zero) return "";
      byte[] b = new byte[c.CredentialBlobSize];
      Marshal.Copy(c.CredentialBlob, b, 0, c.CredentialBlobSize);
      return Encoding.UTF8.GetString(b).TrimEnd('\0');
    } finally { CredFree(p); }
  }
}
"@

$token = [CredReader]::Read('Supabase CLI:supabase')
$sql = Get-Content "supabase\migrations\20260819160000_player_device_binding_zero_trust.sql" -Raw

# In Supabase Management API v1: POST /v1/projects/{ref}/database/query expects JSON: {"query": "..."}
# Make sure query is properly serialized as a JSON string
$jsonPayload = @{ query = $sql.Trim() } | ConvertTo-Json -Depth 5

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json; charset=utf-8"
}

# Use System.Net.Http.HttpClient for exact JSON byte transmission
$client = [System.Net.Http.HttpClient]::new()
$client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $token)
$content = [System.Net.Http.StringContent]::new($jsonPayload, [System.Text.Encoding]::UTF8, "application/json")

$response = $client.PostAsync("https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query", $content).Result
$responseBody = $response.Content.ReadAsStringAsync().Result

Write-Host "Status Code: $($response.StatusCode)"
Write-Host "Response: $responseBody"
