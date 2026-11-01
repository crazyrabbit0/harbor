//! Child-process pipes for tokio commands. Use these instead of `child.stdout`/`stderr`/`stdin` and `Command::output`.
use std::io;
use std::process::{Output, Stdio};

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite};
use tokio::process::{Child, Command};

pub type Reader = Box<dyn AsyncRead + Send + Unpin>;
pub type Writer = Box<dyn AsyncWrite + Send + Unpin>;

// tokio does pipe I/O on Windows as blocking File calls, and std aborts the whole process if one is still pending.
#[cfg(windows)]
fn overlapped(
    handle: io::Result<std::os::windows::io::OwnedHandle>,
) -> Option<tokio::net::windows::named_pipe::NamedPipeClient> {
    use std::os::windows::io::IntoRawHandle;
    let raw = handle.ok()?.into_raw_handle();
    // SAFETY: std opens the parent end of every child pipe for overlapped I/O and we own it here.
    unsafe { tokio::net::windows::named_pipe::NamedPipeClient::from_raw_handle(raw) }.ok()
}

pub fn take_stdout(child: &mut Child) -> Option<Reader> {
    let pipe = child.stdout.take()?;
    #[cfg(windows)]
    let pipe = overlapped(pipe.into_owned_handle())?;
    Some(Box::new(pipe))
}

pub fn take_stderr(child: &mut Child) -> Option<Reader> {
    let pipe = child.stderr.take()?;
    #[cfg(windows)]
    let pipe = overlapped(pipe.into_owned_handle())?;
    Some(Box::new(pipe))
}

pub fn take_stdin(child: &mut Child) -> Option<Writer> {
    let pipe = child.stdin.take()?;
    #[cfg(windows)]
    let pipe = overlapped(pipe.into_owned_handle())?;
    Some(Box::new(pipe))
}

/// Same contract as tokio's `Command::output`: stdout and stderr are always piped.
pub async fn output(command: &mut Command) -> io::Result<Output> {
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    wait_with_output(command.spawn()?).await
}

pub async fn wait_with_output(mut child: Child) -> io::Result<Output> {
    drop(child.stdin.take());
    let stdout = take_stdout(&mut child);
    let stderr = take_stderr(&mut child);
    let (status, stdout, stderr) =
        tokio::try_join!(child.wait(), read_all(stdout), read_all(stderr))?;
    Ok(Output {
        status,
        stdout,
        stderr,
    })
}

async fn read_all(pipe: Option<Reader>) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    if let Some(mut pipe) = pipe {
        pipe.read_to_end(&mut bytes).await?;
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    fn echo() -> Command {
        #[cfg(windows)]
        let mut command = {
            let mut command = Command::new("powershell.exe");
            command.args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "$input | ForEach-Object { $_ }; [Console]::Error.Write('err')",
            ]);
            command
        };
        #[cfg(not(windows))]
        let mut command = {
            let mut command = Command::new("sh");
            command.args(["-c", "cat; printf err >&2"]);
            command
        };
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        command
    }

    #[tokio::test]
    async fn pipes_round_trip_through_a_child() {
        let mut child = echo().spawn().unwrap();
        let mut stdin = take_stdin(&mut child).unwrap();
        let stdout = take_stdout(&mut child).unwrap();
        stdin.write_all(b"one\ntwo\n").await.unwrap();
        stdin.shutdown().await.unwrap();
        drop(stdin);
        let mut lines = BufReader::new(stdout).lines();
        let mut seen = Vec::new();
        while let Some(line) = lines.next_line().await.unwrap() {
            seen.push(line.trim().to_string());
        }
        assert_eq!(seen, ["one", "two"]);
        let rest = wait_with_output(child).await.unwrap();
        assert!(rest.status.success());
        assert_eq!(String::from_utf8_lossy(&rest.stderr).trim(), "err");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn many_concurrent_outputs_complete() {
        let runs = (0..24).map(|_| async {
            let mut command = echo();
            command.stdin(Stdio::null());
            output(&mut command).await.unwrap()
        });
        for result in futures_util::future::join_all(runs).await {
            assert!(result.status.success());
            assert_eq!(String::from_utf8_lossy(&result.stderr).trim(), "err");
        }
    }
}
