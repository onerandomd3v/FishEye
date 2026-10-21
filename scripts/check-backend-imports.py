"""Import both backend entrypoints without starting a server or worker."""

from importlib import import_module

for module_name in ("fisheye_api.main", "fisheye_worker.main"):
    import_module(module_name)
