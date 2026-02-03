package ai.ClosedClaw.android.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class ClosedClawProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", ClosedClawCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", ClosedClawCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", ClosedClawCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", ClosedClawCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", ClosedClawCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", ClosedClawCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", ClosedClawCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", ClosedClawCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", ClosedClawCapability.Canvas.rawValue)
    assertEquals("camera", ClosedClawCapability.Camera.rawValue)
    assertEquals("screen", ClosedClawCapability.Screen.rawValue)
    assertEquals("voiceWake", ClosedClawCapability.VoiceWake.rawValue)
  }

  @Test
  fun screenCommandsUseStableStrings() {
    assertEquals("screen.record", ClosedClawScreenCommand.Record.rawValue)
  }
}
