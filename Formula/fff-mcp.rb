# Originally authored by @jellydn (https://github.com/jellydn/homebrew-tap).
# Maintained in-repo; auto-bumped by .github/workflows/release.yaml on stable releases.
class FffMcp < Formula
  desc "Fast file search toolkit for AI agents (MCP server)"
  homepage "https://github.com/GroepOnline/pi-tools"
  license "MIT"
  version "0.10.8"

  LIVECHECK_REPO = "GroepOnline/pi-tools".freeze
  RELEASE_BASE = "https://github.com/GroepOnline/pi-tools/releases/download".freeze

  on_macos do
    on_arm do
      url "#{RELEASE_BASE}/v#{version}/fff-mcp-aarch64-apple-darwin"
      sha256 "0cda90129b3408606c1b55b8390726d2065828bc5e8368afac28dc0d860f30a5"
    end

    on_intel do
      url "#{RELEASE_BASE}/v#{version}/fff-mcp-x86_64-apple-darwin"
      sha256 "c7b17d9930cf2b3a0dae12411a52f4990e90707316c955847ae3b88f39b69e40"
    end
  end

  on_linux do
    on_arm do
      url "#{RELEASE_BASE}/v#{version}/fff-mcp-aarch64-unknown-linux-gnu"
      sha256 "e168fb440edeab09419da8e801e9c73afd22e7bc73722df7e2e52b46b5208d10"
    end

    on_intel do
      url "#{RELEASE_BASE}/v#{version}/fff-mcp-x86_64-unknown-linux-gnu"
      sha256 "bac7be268396a3bfa729a0328e0a6eac147ec7e3da60132bacbf54fdfeb231a1"
    end
  end

  livecheck do
    url "https://github.com/#{LIVECHECK_REPO}/releases/latest"
    strategy :github_latest
  end

  def install
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "fff-mcp-aarch64-apple-darwin" => "fff-mcp"
      elsif Hardware::CPU.intel?
        bin.install "fff-mcp-x86_64-apple-darwin" => "fff-mcp"
      end
    elsif OS.linux?
      if Hardware::CPU.arm?
        bin.install "fff-mcp-aarch64-unknown-linux-gnu" => "fff-mcp"
      elsif Hardware::CPU.intel?
        bin.install "fff-mcp-x86_64-unknown-linux-gnu" => "fff-mcp"
      end
    end
  end

  test do
    system bin/"fff-mcp", "--healthcheck"
  end
end
