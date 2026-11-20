from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = 'ir.http'

    def color_scheme(self):
        """Dark or light backend, from the shared Dark Mode option (Settings >
        Backend Theme, or Quick settings in the top bar). "dark" makes the web
        client load web.assets_web_dark, which carries this theme's dark
        palette."""
        if self.env['res.config.settings']._minimal_theme_get_settings()['dark_mode']:
            return 'dark'
        return 'light'

    def _register_hook(self):
        super()._register_hook()
        # When installed alongside web_enterprise without a hard dependency,
        # web_enterprise may be loaded after this module in the MRO.
        # Ensure minimal_backend_theme's color_scheme takes precedence.
        type(self).color_scheme = IrHttp.color_scheme

    def session_info(self):
        info = super().session_info()
        if self.env.user._is_internal():
            settings = self.env['res.config.settings']._minimal_theme_get_settings()
            settings['pinned_menu_ids'] = self.env['minimal_backend_theme.menu_pin'].get_pinned_menu_ids()
            info['minimal_backend_theme'] = settings
        return info
