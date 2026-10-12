Dim objShell, objFSO, strRoot, strLog
Set objShell = CreateObject("WScript.Shell")
Set objFSO   = CreateObject("Scripting.FileSystemObject")
strRoot = objFSO.GetParentFolderName(WScript.ScriptFullName)
strLog  = strRoot & "\webatm_server.log"
objShell.Run "cmd /c cd /d """ & strRoot & """ && python WebATM.py >> """ & strLog & """ 2>&1", 0, False
