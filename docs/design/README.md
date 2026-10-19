# 夜喵首页

## Design

- Editable Figma file: https://www.figma.com/design/OzdEkkEaxXCoaFAw69Py4q
- Home frame: https://www.figma.com/design/OzdEkkEaxXCoaFAw69Py4q?node-id=6-2
- Prototype: https://www.figma.com/proto/OzdEkkEaxXCoaFAw69Py4q?node-id=6-2&starting-point-node-id=6%3A2
- Pages: 设计基础、首页与原型、首页组件。
- Nine screens include the homepage, four conversation states, records, guide, breathing and settings.
- Editable text uses Noto Sans SC. The mini program uses the device's available Chinese system font when Noto Sans SC is unavailable.
- Topic, input, practice and navigation components remain instances on the homepage. Topic and navigation icons use instance swap properties.
- Four topic buttons set a prototype string variable before opening the input state.
- The additional existing-page frames show navigation destinations; their controls are simplified. Actual settings and breathing logic remain in the existing mini program pages.
- `figma-state.json` records node IDs, component IDs, variables and screen IDs for future edits.

## Mini Program

`pages/agent/index` is the default launch page. The breathing page retains its existing interaction and now includes a 夜喵 navigation item. Shared record presentation uses `utils/record-view.js` and the existing local storage keys.

The conversation screen is explicitly a preview. It preserves a submitted message and shows a connection/unavailable state with retry. No Agent endpoint, generated reply or remote transmission is present. Drafts and messages live only in the page instance.

The exercise button opens the existing preparation/关灯 guide. It does not introduce a new five-minute timer.

The preview server renders the actual homepage WXML, WXSS and page methods with a small browser adapter. Native navigation calls are recorded for verification; the browser preview does not implement the entire WeChat runtime or navigate to other mini program pages.

```powershell
node tools/nightcat-preview.js
# http://127.0.0.1:4180
node --test
node tools/verify-nightcat.js
```

The browser verifier uses the bundled Playwright package and local Chrome. Set `NIGHTCAT_NODE_MODULES` and `NIGHTCAT_CHROME` to override those paths. Set `NIGHTCAT_PREVIEW_PORT` to change the preview server port; adjust the verifier URL correspondingly.

## Assets

- ~~`assets/agent/night-cat.jpg`~~: 2026-10-17 删除（全仓零引用，死资产）。
- `assets/agent/moon-lake.jpg`: text-free exercise cover, 161387 bytes（2026-10-17 按显示尺寸重缩为 300×380 q72）。
- `assets/agent/icons/`: Lucide bitmap exports for reliable mini program rendering; `icons.json` contains the original SVG paths used in Figma.
- Original generated PNGs: `C:/Users/16494/Documents/ChatGPT/SLEEPWELL/output/nightcat/`.
- `reference.png`: the supplied visual reference, embedded separately in Figma.

Images were generated using Figma's native `generate_image` tool with `gemini-3.1-flash-image`, then saved locally and compressed. No image-generation CLI fallback was used.

Cat prompt: A fluffy grey tabby and white kitten asleep on dark teal bedding, eyes closed, white muzzle and pink nose, one white paw toward the viewer, body curled right. Warm amber moonlight on fur; nighttime bedroom, window and crescent moon on upper right, indoor plant on left. Detailed painterly illustration in deep emerald teal and muted gold. Wide composition, no people, text, UI, border or watermark.

Cover prompt: Square painterly nighttime illustration of a pale golden crescent moon over a quiet dark teal mountain lake, dandelion flowers and seed heads in foreground, golden reflections on still water. No text, UI, frame or watermark.

## Verification

- 29 Node tests cover existing behavior and new homepage routing, drafts, send/retry, keyboard lifecycle and shared records.
- Playwright checks 320x640, 375x812 and 430x932 layouts; images load, no horizontal overflow, and key controls have at least 44px touch height.
- Interaction checks cover topic prefill, sending, unavailable state, retry with retained message, keyboard inset, records and exercise route.
- Screenshots and `browser-checks.json` are saved alongside this document.
- Figma text has no missing fonts and uses Noto Sans SC; exported screenshots were inspected.
- WeChat Developer Tools compilation and physical-device keyboard/safe-area behavior have not been verified on this machine. Open the existing project in Developer Tools and test both standard and short-screen devices before release.
