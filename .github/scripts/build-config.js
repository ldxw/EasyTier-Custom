// One source of truth for build matrices and release artifact validation.
// `release` targets produce the downloadable product archives; `dockerArch` targets
// additionally upload bare musl binaries consumed by docker.yml. x86_64-linux is both.
const coreTargets = [
  ['x86_64-unknown-linux-musl', 'ubuntu-24.04', 'linux-x86_64', 'x86_64', true],
  ['x86_64-apple-darwin', 'macos-15-intel', 'macos-x86_64', '', true],
  ['x86_64-pc-windows-msvc', 'windows-latest', 'windows-x86_64', '', true],
  ['arm-unknown-linux-musleabihf', 'ubuntu-24.04', 'linux-armhf', 'armhf', false],
  ['armv7-unknown-linux-musleabihf', 'ubuntu-24.04', 'linux-armv7hf', 'armv7hf', false],
  ['aarch64-unknown-linux-musl', 'ubuntu-24.04', 'linux-aarch64', 'aarch64', false],
  ['riscv64gc-unknown-linux-musl', 'ubuntu-24.04', 'linux-riscv64', 'riscv64', false],
].map(([target, os, name, dockerArch, release]) => ({
  target, os, name, dockerArch, release,
  // jemalloc's C sources do not cross-compile reliably for arm/riscv64.
  features: /windows|aarch64|riscv64/.test(target) ? 'mimalloc' : 'jemalloc',
}));

const guiTargets = coreTargets
  .filter(({ target }) => /windows|darwin/.test(target))
  .map(({ target, os, name }) => ({ target, os, name }));
const androidArchs = ['aarch64'];
// PR checks stay on the three shipped x86-64 targets instead of every Docker target.
const checkTargets = coreTargets.filter(({ release }) => release);

const infrastructure = /^(\.github\/(workflows\/|tauri-ci\.json$|actions\/|scripts\/)|package\.json$)/;
const rustPaths = /^(Cargo\.(toml|lock)$|rust-toolchain\.toml$|\.cargo\/|\.config\/nextest\.toml$|easytier\/|easytier-core\/|easytier-proto\/|easytier-rpc-build\/|easytier-web\/|easytier-gui\/|tauri-plugin-vpnservice\/|easytier-contrib\/)/;
const frontendPaths = /^(pnpm-(lock|workspace)\.yaml$|easytier-web\/(frontend\/|frontend-lib\/|config-generator\/)|easytier-gui\/|tauri-plugin-vpnservice\/|easytier-proto\/proto\/|easytier-core\/src\/config\/|easytier-core\/src\/lib\.rs$|Cargo\.(toml|lock)$|rust-toolchain\.toml$|\.cargo\/)/;

function buildPlan({ eventName, ref, draft = false, changedFiles = [], workflowKind = 'build' }) {
  const manual = eventName === 'workflow_dispatch';
  const full = (manual && workflowKind === 'build') || (eventName === 'push' && ref === 'refs/heads/main');
  const active = !draft && (full || manual || eventName === 'pull_request' ||
    (eventName === 'push' && ref === 'refs/heads/develop'));
  const matches = pattern => changedFiles.some(file => pattern.test(file) || infrastructure.test(file));
  const rust = active && (full || manual || matches(rustPaths));
  // Rust lint/unit tests also consume the generated frontend assets. Build once.
  const frontend = active && (rust || full || matches(frontendPaths));
  return {
    active, full: active && full, rust, frontend,
    config_generator: active && (full || manual || matches(/^(easytier-web\/config-generator\/|easytier-core\/|easytier-proto\/|Cargo\.(toml|lock)$|rust-toolchain\.toml$|\.cargo\/)/)),
    ci: active,
    go: active && (eventName === 'workflow_dispatch' || matches(/^(easytier-go\/|easytier-proto\/proto\/)/)),
    js: active && (eventName === 'workflow_dispatch' || matches(/^(Cargo\.(toml|lock)$|easytier-(core|proto|js)\/)/)),
    nix: active && (eventName === 'workflow_dispatch' || matches(/(^|\/)[^/]+\.nix$|^flake\.lock$|^rust-toolchain\.toml$/)),
  };
}

module.exports = { coreTargets, guiTargets, androidArchs, checkTargets, buildPlan };
