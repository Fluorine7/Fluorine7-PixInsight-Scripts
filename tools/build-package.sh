#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(python3 -c 'import sys, xml.etree.ElementTree as ET; print(ET.parse(sys.argv[1]).findtext("package/version"))' "$root/package.xml")"
name="Fluorine7BatchScripts-$version.zip"
mkdir -p "$root/build"
build_dir="$(mktemp -d "$root/build/package.XXXXXX")"
package="$root/$name"
staged_package="$build_dir/$name"

mkdir -p "$build_dir/src/scripts/Fluorine7/LICENSES"

# package.xml is source metadata, not an installable file. The updater deploys
# every archive entry, so the archive must contain only the script subtree.
cp "$root/src/scripts/Fluorine7/"*.js "$build_dir/src/scripts/Fluorine7/"
# Include signatures automatically after they have been generated with
# Script > Development > CodeSign.
if compgen -G "$root/src/scripts/Fluorine7/*.xsgn" >/dev/null; then
   cp "$root/src/scripts/Fluorine7/"*.xsgn "$build_dir/src/scripts/Fluorine7/"
fi
cp "$root/LICENSES/"*.txt "$build_dir/src/scripts/Fluorine7/LICENSES/"

(
   cd "$build_dir"
   find src -type f -print | LC_ALL=C sort | zip -X -q "$staged_package" -@
)

python3 - "$staged_package" "$root/package.xml" <<'PY'
import pathlib, sys, xml.etree.ElementTree as ET, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    names = archive.namelist()
    if len(names) != len(set(names)):
        raise SystemExit("Duplicate archive paths")
    for name in names:
        path = pathlib.PurePosixPath(name)
        if not name.startswith("src/scripts/Fluorine7/") or ".." in path.parts:
            raise SystemExit("Disallowed deployment path: " + name)
    required = {node.text for node in ET.parse(sys.argv[2]).findall("package/file-list/file")}
    required.update(str(pathlib.PurePosixPath(name).with_suffix(".xsgn"))
                    for name in required.copy() if name.endswith(".js"))
    missing = required - set(names)
    if missing:
        raise SystemExit("Missing package files: " + ", ".join(sorted(missing)))
    if archive.testzip() is not None:
        raise SystemExit("Archive integrity check failed")
print("Validated deployment paths, required script/signature files and ZIP integrity.")
PY
mv "$staged_package" "$package"

sha1="$(shasum -a 1 "$package" | awk '{print $1}')"
printf 'Built: %s\nSHA-1: %s\n' "$package" "$sha1"
printf '\nUpdate updates.xri with this SHA-1, then sign updates.xri with CodeSign.\n'
