# RS7 protocol notes

Derived from the vendor's Windows driver (static analysis) and its public WebHID configurator, then verified on a real RS7 (firmware build string `221Dec 23 2025`). Vendor binaries are **not** redistributed here.

## Transport
USB interface 2 (`MI_02`, HID usage page `0xFF01`, no report IDs): 64-byte input and output reports. On Linux: the `hidraw` node whose parent is `…:1.2`. Request/response, one outstanding command.

## Frame
```
d[0]=0x55  d[1]=cmd  d[2]=type  d[3]=checksum  d[4:64]=payload
checksum = sum(d[4:]) & 0xFF        (the device does not appear to validate it; the vendor web tool sends constants)
reply: d[0]=0xAA, d[1]=cmd echoed
```

## Commands
| cmd | type | meaning | payload |
|---|---|---|---|
| `03` | `00` | version | reply: `d[8:20]` ident (`YJX.co.mouse`), `d[23:]` build date strings |
| `30` | `A5` | battery | `[2E,1,1,0,0,0]`; reply `d[8]`=percent, `d[9]`=charging |
| `0E` | `A5` | read config | `[2F,1,1,0,0]` |
| `0F` | `AE` | write config | same layout as the read reply, `d[4:9]=[2F,1,1,0,0]` |
| `21` | `00` | lighting mode | `[3,0,0,0,0,0,mode]` (0 off, 1 steady, 2 breathing) |
| `08` | `A5` | read button table | `[20]`; reply entries at `d[8+4i]`, 7 entries, `FF` = default |
| `09` | `A5` | write button table | `[20,0,0,0]` + 8 entries × 4 bytes |

### Config block (read reply / write frame, same indices)
| idx | field |
|---|---|
| 9 | light mode |
| 10 | polling rate + 1 (0=125 Hz … 3=1000 Hz) |
| 11 | DPI stage count (1–6) |
| 12 | active DPI stage + 1 |
| 13–24 | six DPI values, u16 little-endian |
| 48 | scroll reversed (0/1) |
| 49 | lift-off distance in mm (1/2; `FF` unset) |
| 50 | sensor bits: `0x01` ripple control, `0x10` angle snap, `0x20` motion sync |
| 51 | debounce (ms) |
| 52 | sleep minutes (1,3,5,10,20,30,60; `FF` = firmware default) |
| 53 | e-sports mode (0/1) |
| 54–55 | wake-up / move-light nibbles (not exposed; preserved) |

### Button entries `(type, code1, code2, code3)`
`20,mask` mouse button (1 L, 2 R, 4 M, 8 Back, 16 Fwd, 0 disabled) · `21,55` DPI loop · `21,38,01|FF` wheel up/down · `10,mods,keycode` keyboard (HID usage ids; mods 1 Ctrl 2 Shift 4 Alt 8 Super) · `30,lo,hi` consumer-control usage (e.g. `E2,00` mute). Table order: left, right, middle, back, forward, DPI button, wheel up, wheel down.

## Not yet decoded
Macro memory (vendor tool reads/writes 4 KiB in 56-byte chunks via `cmd 0x0C/0x0D`, then `10 A5` commit) and the per-stage RGB bytes (`d[25..47]`) seen in the Windows driver but ignored by the web tool. Preserved untouched on every write.
