package ai.ClosedClaw.android.ui

import androidx.compose.runtime.Composable
import ai.ClosedClaw.android.MainViewModel
import ai.ClosedClaw.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
