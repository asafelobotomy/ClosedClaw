project('closedclaw-messenger',
  version: '1.0.0',
  meson_version: '>= 0.59.0',
)

python = import('python')
py_installation = python.find_installation('python3')

# Install the main application
install_data(
  'closedclaw_messenger.py',
  install_dir: get_option('bindir'),
  rename: 'closedclaw-messenger',
  install_mode: 'rwxr-xr-x',
)

# Install desktop entry
install_data(
  'ai.closedclaw.messenger.desktop',
  install_dir: join_paths(get_option('datadir'), 'applications'),
)

# Install AppStream metainfo
install_data(
  'ai.closedclaw.messenger.metainfo.xml',
  install_dir: join_paths(get_option('datadir'), 'metainfo'),
)
