#!/bin/sh
# Fetches every jar this project needs but does not keep in version control.
#
# libs/ and tools/ hold about 100MB of third party binaries. Committing them would put a binary
# blob in every clone forever, so they are ignored and rebuilt here instead. Versions are pinned:
# a floating version would change what the compat layer compiles against without anything in the
# repository recording it. docs/THIRD-PARTY.md lists the licence of everything under libs/, which
# is the set that ships inside the installer.
#
# Run after a fresh clone, then tools/build.sh. capstan-stage also runs this
# automatically when a checkout has the layer's sources but not its jars, so a build
# runner and a fresh clone provision themselves.
set -e
R=$(cd "$(dirname "$0")/.." && pwd)
M=https://repo1.maven.org/maven2
mkdir -p "$R/libs" "$R/tools"

get() {
  out="$2/$(basename "$1")"
  if [ -s "$out" ]; then echo "  have $(basename "$1")"; return; fi
  echo "  get  $(basename "$1")"
  curl -sSL --fail --retry 3 --retry-all-errors --max-time 180 -o "$out" "$3" || { rm -f "$out"; echo "FAILED $1"; exit 1; }
}

maven() { get "$1" "$2" "$M/$1"; }

# Downloads that do not come from Maven Central are checked against a checksum recorded
# here, so a moved or re-uploaded file stops the build instead of reaching an installer.
verify() {
  want="$1"; file="$2"
  if command -v sha256sum >/dev/null 2>&1; then
    have=$(sha256sum "$file" | cut -d' ' -f1)
  elif command -v shasum >/dev/null 2>&1; then
    have=$(shasum -a 256 "$file" | cut -d' ' -f1)
  else
    echo "FAILED no sha256sum or shasum to verify $(basename "$file") with"
    exit 1
  fi
  if [ "$have" != "$want" ]; then
    echo "FAILED $(basename "$file") does not match its pinned checksum"
    echo "  want $want"
    echo "  have $have"
    exit 1
  fi
  echo "  ok   $(basename "$file")"
}

echo "libs/ (compiled against, and shipped inside the installer)"
maven com/google/code/gson/gson/2.11.0/gson-2.11.0.jar "$R/libs"
maven com/fasterxml/jackson/core/jackson-annotations/2.17.2/jackson-annotations-2.17.2.jar "$R/libs"
maven com/fasterxml/jackson/core/jackson-core/2.17.2/jackson-core-2.17.2.jar "$R/libs"
maven com/fasterxml/jackson/core/jackson-databind/2.17.2/jackson-databind-2.17.2.jar "$R/libs"
maven com/fasterxml/jackson/module/jackson-module-kotlin/2.17.2/jackson-module-kotlin-2.17.2.jar "$R/libs"
maven org/jsoup/jsoup/1.18.1/jsoup-1.18.1.jar "$R/libs"
maven org/jetbrains/kotlin/kotlin-reflect/2.2.20/kotlin-reflect-2.2.20.jar "$R/libs"
maven org/jetbrains/kotlin/kotlin-stdlib/2.2.20/kotlin-stdlib-2.2.20.jar "$R/libs"
# Extensions are built against CloudStream, which builds against current kotlinx-coroutines. A layer
# that ships an older one loads them until the first coroutine call and then dies with
# NoSuchMethodError: BuildersKt.runBlockingK, which only exists from 1.11.0. The version tracks what
# the extensions are compiled against, not what is newest.
maven org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.11.0/kotlinx-coroutines-core-jvm-1.11.0.jar "$R/libs"
maven org/jetbrains/kotlinx/kotlinx-serialization-core-jvm/1.7.3/kotlinx-serialization-core-jvm-1.7.3.jar "$R/libs"
maven org/jetbrains/kotlinx/kotlinx-serialization-json-jvm/1.7.3/kotlinx-serialization-json-jvm-1.7.3.jar "$R/libs"
maven com/squareup/okhttp3/okhttp/4.12.0/okhttp-4.12.0.jar "$R/libs"
maven com/squareup/okio/okio-jvm/3.9.0/okio-jvm-3.9.0.jar "$R/libs"
maven org/mozilla/rhino/1.8.1/rhino-1.8.1.jar "$R/libs"
maven com/google/protobuf/protobuf-javalite/4.35.1/protobuf-javalite-4.35.1.jar "$R/libs"

echo "tools/ (the compiler, used to build, never shipped)"
maven org/jetbrains/kotlin/kotlin-compiler-embeddable/2.2.20/kotlin-compiler-embeddable-2.2.20.jar "$R/tools"
maven org/jetbrains/kotlin/kotlin-daemon-embeddable/2.2.20/kotlin-daemon-embeddable-2.2.20.jar "$R/tools"
maven org/jetbrains/kotlin/kotlin-script-runtime/2.2.20/kotlin-script-runtime-2.2.20.jar "$R/tools"
maven org/jetbrains/intellij/deps/trove4j/1.0.20200330/trove4j-1.0.20200330.jar "$R/tools"
maven org/jetbrains/annotations/24.1.0/annotations-24.1.0.jar "$R/tools"
for j in kotlin-stdlib-2.2.20 kotlin-reflect-2.2.20 kotlinx-coroutines-core-jvm-1.11.0; do
  [ -s "$R/tools/$j.jar" ] || cp "$R/libs/$j.jar" "$R/tools/$j.jar"
done

echo "dex-tools/ (Dalvik to JVM conversion, shipped inside the installer)"
DEXLIB="$R/tools/dex-tools/lib"
mkdir -p "$DEXLIB"
if [ -e "$DEXLIB/dex-tools-v2.4.jar" ]; then
  echo "  have dex-tools"
else
  command -v unzip >/dev/null 2>&1 || { echo "FAILED unzip is needed to extract dex-tools"; exit 1; }
  get dex-tools-v2.4.zip "$R/tools/dex-tools" "https://github.com/pxb1988/dex2jar/releases/download/v2.4/dex-tools-v2.4.zip"
  verify ee7c45eb3c1d2474a6145d8d447e651a736a22d9664b6d3d3be5a5a817dda23a "$R/tools/dex-tools/dex-tools-v2.4.zip"
  unzip -j -o "$R/tools/dex-tools/dex-tools-v2.4.zip" 'dex-tools-v2.4/lib/*.jar' -d "$DEXLIB" >/dev/null
  rm -f "$R/tools/dex-tools/dex-tools-v2.4.zip"
fi

echo "libs/ from outside Maven Central"
get NewPipeExtractor-v0.26.5.jar "$R/libs" "https://jitpack.io/com/github/TeamNewPipe/NewPipeExtractor/v0.26.5/NewPipeExtractor-v0.26.5.jar"
verify 923bf0a60938d570ad176ed7b08fa9fec7d0772d7a386ca89a2dd3b9212979c7 "$R/libs/NewPipeExtractor-v0.26.5.jar"
get nanojson-e9d656d.jar "$R/libs" "https://jitpack.io/com/github/TeamNewPipe/nanojson/e9d656ddb49a412a5a0a5d5ef20ca7ef09549996/nanojson-e9d656ddb49a412a5a0a5d5ef20ca7ef09549996.jar"
verify d495881a322b3c72e5d43284afd7d7021520028ca8b7c6ba861e3fd8d90614d5 "$R/libs/nanojson-e9d656d.jar"

echo
echo "Test fixtures are not fetched:"
echo "  samples/*.cs3 (13 fixtures, only needed by the live tests)"
echo
if [ -e "$DEXLIB/dex-tools-v2.4.jar" ] && [ -s "$R/libs/NewPipeExtractor-v0.26.5.jar" ] && [ -s "$R/libs/nanojson-e9d656d.jar" ]; then
  echo "deps ok"
else
  echo "deps incomplete: run this script again."
  exit 1
fi
