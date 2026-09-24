package com.example

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExampleRobolectricTest {

  @Test
  fun `read string from context`() {
    val context = ApplicationProvider.getApplicationContext<Context>()
    val appName = context.getString(R.string.app_name)
    assertEquals("Arushi AI", appName)
  }

  @Test
  fun `test android app action bridge methods`() {
    val activity = Robolectric.buildActivity(MainActivity::class.java).setup().get()
    val bridge = activity.AndroidAppActionBridge()

    assertTrue(bridge.isBridgeAvailable())

    // Test openUrl
    val urlRes = JSONObject(bridge.openUrl("google.com"))
    assertTrue(urlRes.getBoolean("success"))
    assertEquals("https://google.com", urlRes.getString("url"))

    // Test makeCall
    val callRes = JSONObject(bridge.makeCall("9876543210"))
    assertTrue(callRes.getBoolean("success"))
    assertEquals("9876543210", callRes.getString("phoneNumber"))

    // Test openWhatsApp (uninstalled in default robolectric environment)
    val waRes = JSONObject(bridge.openWhatsApp())
    assertTrue(waRes.has("success"))

    // Test openApp
    val appRes = JSONObject(bridge.openApp("Settings"))
    assertTrue(appRes.getBoolean("success"))
  }
}
