/// Decodes a byte stream into UTF-8 text across arbitrary chunk boundaries.
#[derive(Default)]
pub struct Utf8Stream {
    pending: Vec<u8>,
}

impl Utf8Stream {
    pub fn push(&mut self, bytes: &[u8]) -> String {
        let mut buffer = std::mem::take(&mut self.pending);
        buffer.extend_from_slice(bytes);

        let mut text = String::new();
        let mut rest = buffer.as_slice();
        while let Err(error) = std::str::from_utf8(rest) {
            let valid = error.valid_up_to();
            text.push_str(&String::from_utf8_lossy(&rest[..valid]));
            match error.error_len() {
                Some(invalid) => {
                    text.push(char::REPLACEMENT_CHARACTER);
                    rest = &rest[valid + invalid..];
                }
                None => {
                    // Incomplete sequence at the end: wait for the next chunk.
                    self.pending = rest[valid..].to_vec();
                    return text;
                }
            }
        }
        text.push_str(&String::from_utf8_lossy(rest));
        text
    }
}

#[cfg(test)]
mod tests {
    use super::Utf8Stream;

    #[test]
    fn passes_ascii_through() {
        assert_eq!(Utf8Stream::default().push(b"hola"), "hola");
    }

    #[test]
    fn joins_a_character_split_across_chunks() {
        let bytes = "ñandú".as_bytes();
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(&bytes[..1]), "");
        assert_eq!(stream.push(&bytes[1..5]), "ñand");
        assert_eq!(stream.push(&bytes[5..6]), "");
        assert_eq!(stream.push(&bytes[6..]), "ú");
    }

    #[test]
    fn replaces_invalid_bytes_instead_of_stalling() {
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(&[b'a', 0xff, b'b']), "a\u{fffd}b");
    }

    #[test]
    fn keeps_an_incomplete_tail_after_invalid_bytes() {
        let euro = "€".as_bytes();
        let mut stream = Utf8Stream::default();
        assert_eq!(stream.push(&[0xff, euro[0], euro[1]]), "\u{fffd}");
        assert_eq!(stream.push(&euro[2..]), "€");
    }
}
