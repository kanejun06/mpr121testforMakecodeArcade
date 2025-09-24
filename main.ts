namespace MPR121A {
    const ADDR = 0x5B
    let started = false
    let prevMask = 0
    let i2c: I2C

    // --- レジスタ定義 ---
    const REG_TS_L = 0x00, REG_TS_H = 0x01, REG_SOFTRESET = 0x80
    const REG_ECR = 0x5E, REG_DEB = 0x5B, REG_CFG1 = 0x5C, REG_CFG2 = 0x5D
    const REG_MHDR = 0x2B, REG_NHDR = 0x2C, REG_NCLR = 0x2D, REG_FDLR = 0x2E
    const REG_MHDF = 0x2F, REG_NHDF = 0x30, REG_NCLF = 0x31, REG_FDLF = 0x32
    const REG_NHDT = 0x33, REG_NCLT = 0x34, REG_FDLT = 0x35
    function REG_TTH(k: number) { return 0x41 + k * 2 }
    function REG_RTH(k: number) { return 0x42 + k * 2 }

    // --- ハンドラ格納 ---
    const pressedHandlers: ((k: number) => void)[] = []
    const releasedHandlers: ((k: number) => void)[] = []

    // --- I2C ヘルパ ---
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

    // --- 初期化 ---
    function initOnce() {
        if (started) return
        started = true

        // SDA=20, SCL=19, FREQ=100kHz, MODE=0, address=0
        i2c = pins.createI2C(pins.SDA, pins.SCL)

        // ソフトリセット→停止
        w8(REG_SOFTRESET, 0x63); pause(5)
        w8(REG_ECR, 0x00); pause(5)

        // 推奨フィルタ設定
        w8(REG_MHDR, 0x01); w8(REG_NHDR, 0x01); w8(REG_NCLR, 0x00); w8(REG_FDLR, 0x00)
        w8(REG_MHDF, 0x01); w8(REG_NHDF, 0x01); w8(REG_NCLF, 0xFF); w8(REG_FDLF, 0x02)
        w8(REG_NHDT, 0x01); w8(REG_NCLT, 0xFF); w8(REG_FDLT, 0x02)

        w8(REG_DEB, 0x00); w8(REG_CFG1, 0x10); w8(REG_CFG2, 0x24)

        // 閾値設定
        for (let k = 0; k < 12; k++) { w8(REG_TTH(k), 12); w8(REG_RTH(k), 6) }

        // 起動（12電極有効）
        w8(REG_ECR, 0x8F); pause(5)
        prevMask = readMask()

        // ポーリング（50msごと）
        game.onUpdateInterval(50, function () {
            const m = readMask()
            const diff = m ^ prevMask
            if (diff) {
                for (let n = 0; n < 12; n++) {
                    const bit = 1 << n
                    if (diff & bit) {
                        if (m & bit) pressedHandlers.forEach(h => h(n))
                        else releasedHandlers.forEach(h => h(n))
                    }
                }
                prevMask = m
            }
        })
    }

    // --- API（初期化は内部で自動実行） ---
    export function onPressed(handler: (key: number) => void) {
        initOnce()
        pressedHandlers.push(handler)
    }
    export function onReleased(handler: (key: number) => void) {
        initOnce()
        releasedHandlers.push(handler)
    }
}
