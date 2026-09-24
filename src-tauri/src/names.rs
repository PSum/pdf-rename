//! Filename rules, mirroring src/shared/filename.ts (the UI checks as you type; this is the
//! enforcement). Both run against tests/fixtures/names.json so they cannot drift apart.

use std::cmp::Ordering;

const MAX_BYTES: usize = 250; // leaves room for ".pdf" within the common 255-byte limit
const RESERVED: [&str; 4] = ["con", "prn", "aux", "nul"];

pub fn is_pdf(name: &str) -> bool {
    name.len() >= 4 && name.is_char_boundary(name.len() - 4) && name[name.len() - 4..].eq_ignore_ascii_case(".pdf")
}

pub fn strip_pdf(name: &str) -> &str {
    if is_pdf(name) { &name[..name.len() - 4] } else { name }
}

pub fn to_pdf_name(input: &str) -> String {
    if is_pdf(input) { input.to_string() } else { format!("{input}.pdf") }
}

fn is_reserved(stem: &str) -> bool {
    let s = stem.to_ascii_lowercase();
    RESERVED.contains(&s.as_str())
        || ((s.starts_with("com") || s.starts_with("lpt"))
            && s.len() == 4
            && matches!(s.as_bytes()[3], b'1'..=b'9'))
}

/// Validates what the user typed as the new name (".pdf" optional).
pub fn validate_name(input: &str) -> Option<String> {
    let base = strip_pdf(input);
    if base.trim().is_empty() {
        return Some("Name cannot be empty".into());
    }
    if let Some(c) = base.chars().find(|c| "/\\:*?\"<>|".contains(*c) || (*c as u32) < 0x20) {
        let what = if (c as u32) < 0x20 { "control characters".to_string() } else { format!("\"{c}\"") };
        return Some(format!("Not allowed: {what}  (forbidden: / \\ : * ? \" < > |)"));
    }
    if base.ends_with('.') || base.ends_with(' ') {
        return Some("Name cannot end with a dot or space".into());
    }
    if is_reserved(base.split('.').next().unwrap_or("").trim()) {
        return Some(format!("\"{base}\" is a reserved name on Windows"));
    }
    if base.len() > MAX_BYTES {
        return Some("Name is too long".into());
    }
    None
}

/// Natural, case-insensitive order: "scan2" before "scan10".
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut a, mut b) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (a.peek().copied(), b.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let take = |it: &mut std::iter::Peekable<std::str::Chars>| {
                    let mut n = String::new();
                    while let Some(c) = it.peek().copied().filter(char::is_ascii_digit) {
                        n.push(c);
                        it.next();
                    }
                    n
                };
                let (na, nb) = (take(&mut a), take(&mut b));
                let (ta, tb) = (na.trim_start_matches('0'), nb.trim_start_matches('0'));
                let ord = ta.len().cmp(&tb.len()).then_with(|| ta.cmp(tb));
                if ord != Ordering::Equal {
                    return ord;
                }
            }
            (Some(x), Some(y)) => {
                let ord = x.to_lowercase().cmp(y.to_lowercase());
                if ord != Ordering::Equal {
                    return ord;
                }
                a.next();
                b.next();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        input: String,
        error: Option<String>,
    }
    #[derive(Deserialize)]
    struct Fixture {
        cases: Vec<Case>,
        sort: Vec<String>,
    }

    fn fixture() -> Fixture {
        let json = include_str!("../../tests/fixtures/names.json");
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn validate_name_matches_shared_fixture() {
        for case in fixture().cases {
            let got = validate_name(&case.input);
            match (&case.error, &got) {
                (None, None) => {}
                (Some(want), Some(msg)) if msg.contains(want.as_str()) => {}
                _ => panic!("{:?}: expected {:?}, got {:?}", case.input, case.error, got),
            }
        }
    }

    #[test]
    fn natural_sort_matches_shared_fixture() {
        let want = fixture().sort;
        let mut got = want.clone();
        got.reverse();
        got.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(got, want);
    }

    #[test]
    fn extension_helpers() {
        assert_eq!(to_pdf_name("x"), "x.pdf");
        assert_eq!(to_pdf_name("x.PDF"), "x.PDF");
        assert_eq!(strip_pdf("scan.PDF"), "scan");
        assert_eq!(strip_pdf("scan.pdf.pdf"), "scan.pdf");
        assert!(!is_pdf("ü.pd"));
    }
}
