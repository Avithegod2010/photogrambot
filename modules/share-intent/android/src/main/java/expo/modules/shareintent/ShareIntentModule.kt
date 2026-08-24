package expo.modules.shareintent

import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShareIntentModule : Module() {
  private var pendingUris: MutableList<String> = mutableListOf()
  private var pendingText: String? = null

  override fun definition() = ModuleDefinition {
    Name("ShareIntent")

    OnCreate {
      readIntent(appContext.reactContext?.intent)
    }

    OnNewIntent { intent ->
      readIntent(intent)
    }

    Function("getSharedMedia") {
      return@Function mapOf(
        "uris" to pendingUris.toList(),
        "text" to pendingText
      )
    }

    Function("clearSharedMedia") {
      pendingUris.clear()
      pendingText = null
    }

    Function("shareMedia") { uris: List<String>, mime: String ->
      val context = appContext.reactContext ?: return@Function false
      if (uris.isEmpty()) return@Function false
      val streamIntent = if (uris.size == 1) {
        Intent().apply {
          action = Intent.ACTION_SEND
          type = mime
          putExtra(Intent.EXTRA_STREAM, Uri.parse(uris[0]))
        }
      } else {
        Intent().apply {
          action = Intent.ACTION_SEND_MULTIPLE
          type = mime
          putParcelableArrayListExtra(
            Intent.EXTRA_STREAM,
            ArrayList(uris.map { Uri.parse(it) })
          )
        }
      }
      streamIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      val chooser = Intent.createChooser(streamIntent, "Share").apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(chooser)
      true
    }
  }

  @Suppress("DEPRECATION")
  private fun readIntent(intent: Intent?) {
    if (intent == null) return
    val action = intent.action
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) return
    val uris = mutableListOf<String>()
    if (action == Intent.ACTION_SEND) {
      val single = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
      if (single != null) uris.add(single.toString())
    } else {
      val many = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
      many?.forEach { uris.add(it.toString()) }
    }
    if (uris.isNotEmpty()) {
      pendingUris = uris
      pendingText = null
    } else {
      val text = intent.getStringExtra(Intent.EXTRA_TEXT)
      if (!text.isNullOrBlank()) pendingText = text
    }
  }
}
