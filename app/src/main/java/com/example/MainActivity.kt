package com.example

import android.Manifest
import android.content.ContentProviderOperation
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.AlarmClock
import android.provider.ContactsContract
import android.provider.MediaStore
import android.provider.Settings
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

data class ContactEntry(val name: String, val phone: String)

class MainActivity : ComponentActivity() {

  private var appWebView: WebView? = null

  private val permissionLauncher = registerForActivityResult(
    ActivityResultContracts.RequestMultiplePermissions()
  ) { permissions ->
    val contactsGranted = permissions[Manifest.permission.WRITE_CONTACTS] == true ||
        ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_CONTACTS) == PackageManager.PERMISSION_GRANTED
    if (contactsGranted) {
      seedSampleContacts()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()

    // Request necessary runtime permissions on startup
    permissionLauncher.launch(
      arrayOf(
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.READ_CONTACTS,
        Manifest.permission.WRITE_CONTACTS,
        Manifest.permission.CALL_PHONE
      )
    )

    setContent {
      Surface(
        modifier = Modifier
          .fillMaxSize()
          .systemBarsPadding(),
        color = Color(0xFF090814)
      ) {
        ArushiWebViewScreen(
          onWebViewCreated = { wv ->
            appWebView = wv
          }
        )
      }
    }
  }

  @Composable
  fun ArushiWebViewScreen(onWebViewCreated: (WebView) -> Unit) {
    val bridge = remember { AndroidAppActionBridge() }

    AndroidView(
      modifier = Modifier.fillMaxSize(),
      factory = { context ->
        WebView(context).apply {
          // Use software layer rendering to prevent Mesa rendernode issues in headless/cloud emulator environments
          setLayerType(View.LAYER_TYPE_SOFTWARE, null)

          settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            cacheMode = WebSettings.LOAD_DEFAULT
            loadsImagesAutomatically = true
          }

          webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
              // Automatically grant Web Audio / getUserMedia permission
              runOnUiThread {
                request.grant(request.resources)
              }
            }
          }

          webViewClient = object : WebViewClient() {
            override fun onRenderProcessGone(
              view: WebView?,
              detail: RenderProcessGoneDetail?
            ): Boolean {
              view?.destroy()
              return true
            }

            override fun shouldOverrideUrlLoading(
              view: WebView?,
              request: WebResourceRequest?
            ): Boolean {
              val url = request?.url?.toString() ?: return false
              if (url.contains("android_asset")) {
                return false
              }
              if (url.startsWith("tel:") || url.startsWith("whatsapp:") || url.startsWith("intent:")) {
                try {
                  val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                  }
                  context.startActivity(intent)
                  return true
                } catch (e: Exception) {
                  e.printStackTrace()
                }
              }
              return false
            }
          }

          addJavascriptInterface(bridge, "AndroidBridge")
          addJavascriptInterface(bridge, "AndroidAppActionBridge")
          loadUrl("file:///android_asset/index.html")

          onWebViewCreated(this)
        }
      }
    )

    BackHandler(enabled = appWebView?.canGoBack() == true) {
      appWebView?.goBack()
    }

    DisposableEffect(Unit) {
      onDispose {
        appWebView?.destroy()
        appWebView = null
      }
    }
  }

  // --- Seed Sample Contacts for Seamless Emulator & Device Testing ---
  fun seedSampleContacts(): String {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
      return "WRITE_CONTACTS permission not granted"
    }

    try {
      val cursor = contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME),
        null,
        null,
        null
      )
      val count = cursor?.use { it.count } ?: 0
      if (count > 0) {
        return "Contacts already present ($count contacts)"
      }

      val samples = listOf(
        Pair("Mom", "+919876543210"),
        Pair("Dad", "+919876543211"),
        Pair("Rahul Sharma", "+919876543212"),
        Pair("Rahul Verma", "+919876543213")
      )

      for ((name, number) in samples) {
        val ops = ArrayList<ContentProviderOperation>()
        ops.add(
          ContentProviderOperation.newInsert(ContactsContract.RawContacts.CONTENT_URI)
            .withValue(ContactsContract.RawContacts.ACCOUNT_TYPE, null)
            .withValue(ContactsContract.RawContacts.ACCOUNT_NAME, null)
            .build()
        )
        ops.add(
          ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
            .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
            .withValue(
              ContactsContract.Data.MIMETYPE,
              ContactsContract.CommonDataKinds.StructuredName.CONTENT_ITEM_TYPE
            )
            .withValue(ContactsContract.CommonDataKinds.StructuredName.DISPLAY_NAME, name)
            .build()
        )
        ops.add(
          ContentProviderOperation.newInsert(ContactsContract.Data.CONTENT_URI)
            .withValueBackReference(ContactsContract.Data.RAW_CONTACT_ID, 0)
            .withValue(
              ContactsContract.Data.MIMETYPE,
              ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE
            )
            .withValue(ContactsContract.CommonDataKinds.Phone.NUMBER, number)
            .withValue(
              ContactsContract.CommonDataKinds.Phone.TYPE,
              ContactsContract.CommonDataKinds.Phone.TYPE_MOBILE
            )
            .build()
        )
        contentResolver.applyBatch(ContactsContract.AUTHORITY, ops)
      }
      return "Seeded 4 contacts (Mom, Dad, Rahul Sharma, Rahul Verma)"
    } catch (e: Exception) {
      e.printStackTrace()
      return "Seeding error: ${e.message}"
    }
  }

  // --- Native Android Bridge Implementation ---
  inner class AndroidAppActionBridge {

    @JavascriptInterface
    fun isBridgeAvailable(): Boolean = true

    @JavascriptInterface
    fun getApiKey(): String {
      return BuildConfig.GEMINI_API_KEY
    }

    @JavascriptInterface
    fun openWhatsApp(): String {
      return try {
        val pm = packageManager
        val intent = pm.getLaunchIntentForPackage("com.whatsapp")
          ?: pm.getLaunchIntentForPackage("com.whatsapp.w4b")
        if (intent != null) {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(intent)
          JSONObject().apply {
            put("success", true)
            put("action", "openWhatsApp")
            put("message", "WhatsApp launched successfully")
          }.toString()
        } else {
          JSONObject().apply {
            put("success", false)
            put("error", "not_installed")
            put("action", "openWhatsApp")
            put("message", "WhatsApp is not installed on this device")
          }.toString()
        }
      } catch (e: Exception) {
        JSONObject().apply {
          put("success", false)
          put("error", "launch_failed")
          put("action", "openWhatsApp")
          put("message", "Failed to open WhatsApp: ${e.message}")
        }.toString()
      }
    }

    @JavascriptInterface
    fun openApp(appName: String): String {
      val clean = appName.trim().lowercase()
      if (clean == "whatsapp") {
        return openWhatsApp()
      }

      val specialIntent = when (clean) {
        "settings", "phone settings", "device settings", "system settings" ->
          Intent(Settings.ACTION_SETTINGS)
        "camera" ->
          Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)
        "alarm", "clock", "alarms" ->
          Intent(AlarmClock.ACTION_SHOW_ALARMS)
        else -> null
      }

      if (specialIntent != null) {
        return try {
          specialIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(specialIntent)
          JSONObject().apply {
            put("success", true)
            put("action", "openApp")
            put("appName", appName)
            put("message", "$appName opened successfully")
          }.toString()
        } catch (e: Exception) {
          JSONObject().apply {
            put("success", false)
            put("action", "openApp")
            put("appName", appName)
            put("error", e.message)
          }.toString()
        }
      }

      val knownPackages = mapOf(
        "youtube" to "com.google.android.youtube",
        "instagram" to "com.instagram.android",
        "chrome" to "com.android.chrome",
        "google chrome" to "com.android.chrome",
        "maps" to "com.google.android.apps.maps",
        "google maps" to "com.google.android.apps.maps",
        "gmail" to "com.google.android.gm",
        "mail" to "com.google.android.gm",
        "spotify" to "com.spotify.music",
        "play store" to "com.android.vending",
        "playstore" to "com.android.vending",
        "google play" to "com.android.vending",
        "photos" to "com.google.android.apps.photos"
      )

      var targetPkg = knownPackages[clean]
      val pm = packageManager

      if (targetPkg == null) {
        try {
          val installed = pm.getInstalledApplications(PackageManager.GET_META_DATA)
          for (app in installed) {
            val label = pm.getApplicationLabel(app).toString().lowercase()
            if (label == clean || label.contains(clean)) {
              targetPkg = app.packageName
              break
            }
          }
        } catch (e: Exception) {
          e.printStackTrace()
        }
      }

      if (targetPkg != null) {
        val launchIntent = pm.getLaunchIntentForPackage(targetPkg)
        if (launchIntent != null) {
          launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(launchIntent)
          return JSONObject().apply {
            put("success", true)
            put("action", "openApp")
            put("appName", appName)
            put("packageName", targetPkg)
            put("message", "$appName opened successfully")
          }.toString()
        }
      }

      return JSONObject().apply {
        put("success", false)
        put("action", "openApp")
        put("appName", appName)
        put("error", "not_installed")
        put("message", "$appName is not installed on this device")
      }.toString()
    }

    @JavascriptInterface
    fun makeCall(phoneNumber: String): String {
      val clean = phoneNumber.replace(Regex("[^0-9+]"), "")
      if (clean.isBlank()) {
        return JSONObject().apply {
          put("success", false)
          put("error", "invalid_number")
          put("message", "Invalid phone number provided")
        }.toString()
      }

      val hasCallPerm = ContextCompat.checkSelfPermission(
        this@MainActivity,
        Manifest.permission.CALL_PHONE
      ) == PackageManager.PERMISSION_GRANTED

      return try {
        if (hasCallPerm) {
          val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$clean")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          startActivity(intent)
          JSONObject().apply {
            put("success", true)
            put("action", "makeCall")
            put("phoneNumber", clean)
            put("directCall", true)
            put("message", "Calling $clean")
          }.toString()
        } else {
          val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$clean")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          startActivity(intent)
          JSONObject().apply {
            put("success", true)
            put("action", "makeCall")
            put("phoneNumber", clean)
            put("directCall", false)
            put("message", "Opening dialer with $clean")
          }.toString()
        }
      } catch (e: Exception) {
        JSONObject().apply {
          put("success", false)
          put("error", "call_failed")
          put("message", e.message ?: "Failed to initiate call")
        }.toString()
      }
    }

    @JavascriptInterface
    fun callContact(contactName: String): String {
      if (ContextCompat.checkSelfPermission(
          this@MainActivity,
          Manifest.permission.READ_CONTACTS
        ) != PackageManager.PERMISSION_GRANTED
      ) {
        return JSONObject().apply {
          put("success", false)
          put("error", "permission_denied")
          put("message", "READ_CONTACTS permission required")
        }.toString()
      }

      val clean = contactName.trim().lowercase()
      val searchTerms = when (clean) {
        "mom", "mummy", "mother", "maa" -> listOf("mom", "mummy", "mother", "maa")
        "dad", "daddy", "father", "papa" -> listOf("dad", "daddy", "father", "papa")
        else -> listOf(clean)
      }

      val matches = mutableListOf<ContactEntry>()
      val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
      val projection = arrayOf(
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
        ContactsContract.CommonDataKinds.Phone.NUMBER
      )

      try {
        contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
          val nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
          val numIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
          val seen = mutableSetOf<String>()

          while (cursor.moveToNext()) {
            val name = cursor.getString(nameIdx) ?: continue
            val num = cursor.getString(numIdx) ?: continue
            val lower = name.lowercase()

            val isMatch = searchTerms.any { term ->
              lower.contains(term) || term.contains(lower)
            }

            if (isMatch && !seen.contains(name)) {
              seen.add(name)
              matches.add(ContactEntry(name, num))
            }
          }
        }
      } catch (e: Exception) {
        e.printStackTrace()
      }

      return when {
        matches.isEmpty() -> {
          JSONObject().apply {
            put("success", false)
            put("error", "not_found")
            put("contactName", contactName)
            put("message", "No contact found matching '$contactName'")
          }.toString()
        }
        matches.size == 1 -> {
          val match = matches[0]
          makeCall(match.phone)
          JSONObject().apply {
            put("success", true)
            put("action", "callContact")
            put("contactName", match.name)
            put("phoneNumber", match.phone)
            put("message", "Calling ${match.name}")
          }.toString()
        }
        else -> {
          val names = JSONArray(matches.map { it.name })
          JSONObject().apply {
            put("success", false)
            put("error", "multiple_matches")
            put("contactName", contactName)
            put("matches", names)
            put(
              "message",
              "Found ${matches.size} contacts matching '$contactName': ${matches.joinToString { it.name }}. Please ask which one to call."
            )
          }.toString()
        }
      }
    }

    @JavascriptInterface
    fun openUrl(url: String): String {
      val clean = url.trim()
      val full = if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
        "https://$clean"
      } else {
        clean
      }
      return try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(full)).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(intent)
        JSONObject().apply {
          put("success", true)
          put("action", "openUrl")
          put("url", full)
          put("message", "Opened $full")
        }.toString()
      } catch (e: Exception) {
        JSONObject().apply {
          put("success", false)
          put("error", "url_failed")
          put("message", e.message ?: "Failed to open URL")
        }.toString()
      }
    }

    @JavascriptInterface
    fun seedContactsIfNeeded(): String {
      return seedSampleContacts()
    }
  }
}
