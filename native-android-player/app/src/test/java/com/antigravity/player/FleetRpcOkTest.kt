package com.antigravity.player

import com.antigravity.player.util.rpcResponseOk
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** F-34: o Postgres devolve {"ok": true} (com espaco); a checagem por substring nunca casava. */
class FleetRpcOkTest {
    @Test fun okWithSpace() = assertTrue(rpcResponseOk("{\"ok\": true, \"device_id\": \"x\"}"))
    @Test fun okCompact() = assertTrue(rpcResponseOk("{\"ok\":true}"))
    @Test fun notOk() = assertFalse(rpcResponseOk("{\"ok\": false, \"error\": \"screen_denied\"}"))
    @Test fun garbage() = assertFalse(rpcResponseOk("null"))
}
