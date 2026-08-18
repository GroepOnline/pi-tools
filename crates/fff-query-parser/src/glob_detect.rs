//! Glob wildcard detection: zlob when available, pure-Rust fallback otherwise.

#[cfg(feature = "zlob")]
#[inline]
pub fn has_wildcards(s: &str) -> bool {
    zlob::has_wildcards(s, zlob::ZlobFlags::RECOMMENDED)
}

#[cfg(not(feature = "zlob"))]
#[inline]
pub fn has_wildcards(s: &str) -> bool {
    s.bytes().any(|b| matches!(b, b'*' | b'?' | b'[' | b'{'))
}
