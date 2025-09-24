namespace MPR121A {
    const ADDR = 0x5B
    let started = false
    let prevMask = 0
    let i2c: I2C

    // 公開: いま押されているCH（無しは -1）
    export let TouchID = -1

    // --- レジスタ定義 ---
    const REG_TS_L = 0x00, REG_TS_H = 0x01, REG_SOFTRESET = 0x80
    const REG_ECR = 0x5E, REG_DEB = 0x5B, REG_CFG1 = 0x5C, REG_CFG2 = 0x5D
    const REG_MHDR = 0x2B, REG_NHDR = 0x2C, REG_NCLR = 0x2D, REG_FDLR = 0x2E
    const REG_MHDF = 0x2F, REG_NHDF = 0x30, REG_NCLF = 0x31, REG_FDLF = 0x32
    const REG_NHDT = 0x33, REG_NCLT = 0x34, REG_FDLT = 0x35
    function REG_TTH(k: number) { return 0x41 + k * 2 }
    function REG_RTH(k: number) { return 0x42 + k * 2 }

    // ハンドラ
    const pressedHandlers: ((k: number) => void)[] = []
    const releasedHandlers: ((k: number) => void)[] = []

    // ★CH表示用オフセット（デフォルト0）
    let chOffset = 0
    /** CHとTxのズレ補正（例: CH0≡T8なら setChannelOffset(4)） */
    export function setChannelOffset(n: number) {
        chOffset = ((n % 12) + 12) % 12
    }

    // I2C ヘルパ
    function w8(reg: number, val: number) {
        const b = pins.createBuffer(2)
        b.setNumber(NumberFormat.UInt8LE, 0, reg)
        b.setNumber(NumberFormat.UInt8LE, 1, val & 0xFF)
        i2c.writeBuffer(ADDR, b)
    }
    function r8(reg: number): number {
        const w = pins.createBuffer(1)
        w.setNumber(NumberFormat.UInt8LE, 0, reg)
        i2c.writeBuffer(ADDR, w)
        const rb = i2c.readBuffer(ADDR, 1)
        return rb.getNumber(NumberFormat.UInt8LE, 0)
    }
    function readMask(): number {
        const l = r8(REG_TS_L), h = r8(REG_TS_H)
        return ((h << 8) | l) & 0x0FFF
    }

    // 初期化
    function initOnce() {
        if (started) return
        started = true

        // Arcade: 2引数版 (必要なら pins.SDA/pins.SCL→数値に変更)
        i2c = pins.createI2C(pins.SDA, pins.SCL)
        // 例: i2c = pins.createI2C(20, 19)

        // ソフトリセット→停止
        w8(REG_SOFTRESET, 0x63); pause(5)
        w8(REG_ECR, 0x00); pause(5)

        // 推奨フィルタ/設定
        w8(REG_MHDR, 0x01); w8(REG_NHDR, 0x01); w8(REG_NCLR, 0x00); w8(REG_FDLR, 0x00)
        w8(REG_MHDF, 0x01); w8(REG_NHDF, 0x01); w8(REG_NCLF, 0xFF); w8(REG_FDLF, 0x02)
        w8(REG_NHDT, 0x01); w8(REG_NCLT, 0xFF); w8(REG_FDLT, 0x02)
        w8(REG_DEB, 0x00); w8(REG_CFG1, 0x10); w8(REG_CFG2, 0x24)

        // 閾値
        for (let k = 0; k < 12; k++) { w8(REG_TTH(k), 12); w8(REG_RTH(k), 6) }

        // 起動（12電極）
        w8(REG_ECR, 0x8F); pause(5)
        prevMask = readMask()

        // ポーリング（エッジ検出）
        game.onUpdateInterval(50, function () {
            const m = readMask()
            const diff = m ^ prevMask
            if (diff) {
                for (let e = 0; e < 12; e++) {        // e: electrode index (T)
                    const bit = 1 << e
                    if (diff & bit) {
                        const ch = (e + chOffset) % 12 // 補正後CH
                        if (m & bit) {
                            TouchID = ch              // 押下中CHを保持
                            pressedHandlers.forEach(h => h(ch))
                        } else {
                            if (TouchID === ch) TouchID = -1
                            releasedHandlers.forEach(h => h(ch))
                        }
                    }
                }
                prevMask = m
            }
        })
    }

    // API
    export function onPressed(handler: (key: number) => void) {
        initOnce()
        pressedHandlers.push(handler)
    }
    export function onReleased(handler: (key: number) => void) {
        initOnce()
        releasedHandlers.push(handler)
    }
}
