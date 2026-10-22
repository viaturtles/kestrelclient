//! Minimal reader for Minecraft's NBT format (servers.dat, level.dat).

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum Tag {
    End, Byte(i8), Short(i16), Int(i32), Long(i64), Float(f32), Double(f64),
    ByteArray(usize), Str(String), List(Vec<Tag>), Compound(Vec<(String, Tag)>), IntArray(usize), LongArray(usize),
}

impl Tag {
    pub fn get(&self, key: &str) -> Option<&Tag> {
        match self { Tag::Compound(v) => v.iter().find(|(k, _)| k == key).map(|(_, t)| t), _ => None }
    }
    pub fn str(&self) -> Option<&str> { match self { Tag::Str(s) => Some(s), _ => None } }
    pub fn long(&self) -> Option<i64> { match self { Tag::Long(v) => Some(*v), Tag::Int(v) => Some(*v as i64), _ => None } }
    pub fn list(&self) -> &[Tag] { match self { Tag::List(v) => v, _ => &[] } }
}

struct R<'a> { b: &'a [u8], i: usize }
impl<'a> R<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        if self.i + n > self.b.len() { return Err("NBT ended early".into()); }
        let s = &self.b[self.i..self.i + n]; self.i += n; Ok(s)
    }
    fn u8(&mut self) -> Result<u8, String> { Ok(self.take(1)?[0]) }
    fn i16(&mut self) -> Result<i16, String> { Ok(i16::from_be_bytes(self.take(2)?.try_into().unwrap())) }
    fn i32(&mut self) -> Result<i32, String> { Ok(i32::from_be_bytes(self.take(4)?.try_into().unwrap())) }
    fn i64(&mut self) -> Result<i64, String> { Ok(i64::from_be_bytes(self.take(8)?.try_into().unwrap())) }
    fn string(&mut self) -> Result<String, String> {
        let n = u16::from_be_bytes(self.take(2)?.try_into().unwrap()) as usize;
        Ok(String::from_utf8_lossy(self.take(n)?).to_string())
    }
    fn len(&mut self) -> Result<usize, String> {
        let n = self.i32()?; if n < 0 || n > 50_000_000 { return Err("Bad NBT length".into()); } Ok(n as usize)
    }
    fn payload(&mut self, t: u8, depth: u32) -> Result<Tag, String> {
        if depth > 64 { return Err("NBT too deep".into()); }
        Ok(match t {
            0 => Tag::End,
            1 => Tag::Byte(self.u8()? as i8),
            2 => Tag::Short(self.i16()?),
            3 => Tag::Int(self.i32()?),
            4 => Tag::Long(self.i64()?),
            5 => Tag::Float(f32::from_bits(self.i32()? as u32)),
            6 => Tag::Double(f64::from_bits(self.i64()? as u64)),
            7 => { let n = self.len()?; self.take(n)?; Tag::ByteArray(n) }
            8 => Tag::Str(self.string()?),
            9 => { let et = self.u8()?; let n = self.len()?; let mut v = Vec::with_capacity(n.min(4096)); for _ in 0..n { v.push(self.payload(et, depth + 1)?); } Tag::List(v) }
            10 => {
                let mut v = Vec::new();
                loop { let ct = self.u8()?; if ct == 0 { break; } let name = self.string()?; v.push((name, self.payload(ct, depth + 1)?)); }
                Tag::Compound(v)
            }
            11 => { let n = self.len()?; self.take(n * 4)?; Tag::IntArray(n) }
            12 => { let n = self.len()?; self.take(n * 8)?; Tag::LongArray(n) }
            _ => return Err(format!("Unknown NBT tag {t}")),
        })
    }
}

/// Parses uncompressed NBT bytes and returns the root compound.
pub fn parse(bytes: &[u8]) -> Result<Tag, String> {
    let mut r = R { b: bytes, i: 0 };
    let t = r.u8()?;
    if t != 10 { return Err("NBT root is not a compound".into()); }
    let _ = r.string()?;
    r.payload(10, 0)
}

/// Parses gzip-compressed NBT (level.dat).
pub fn parse_gzip(bytes: &[u8]) -> Result<Tag, String> {
    use std::io::Read;
    let mut d = flate2::read::GzDecoder::new(bytes);
    let mut out = Vec::new();
    d.read_to_end(&mut out).map_err(|e| format!("Unzip NBT: {e}"))?;
    parse(&out)
}
