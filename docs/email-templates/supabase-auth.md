# Templates de e-mail do Supabase Auth

Os e-mails transacionais de pedidos e recuperação de senha são renderizados pelo código do ProxyBembem. Já os e-mails de **confirmação de cadastro** e **confirmação de alteração de e-mail** são renderizados pelo Supabase Auth e precisam ser configurados no Dashboard do projeto.

Use estes templates para manter a identidade visual do site sem depender de CSS externo, fontes externas ou imagens remotas.

## Confirm signup

**Subject**

```text
Confirme seu e-mail — ProxyBembem
```

**Body**

```html
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#0b0912;font-family:Georgia,'Times New Roman',serif;color:#f5f3ff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#0b0912;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#15111f;border:1px solid #332641;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 20px;text-align:center;border-bottom:1px solid #332641;">
                <div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#8b5cf6;font-weight:700;">◆ ProxyBembem ◆</div>
                <div style="margin:14px auto 0;width:72px;height:2px;background:#8b5cf6;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 12px;text-align:center;">
                <div style="display:inline-block;margin-bottom:14px;padding:7px 12px;border:1px solid #332641;border-radius:999px;background:#1d1729;font-family:Arial,sans-serif;font-size:11px;line-height:1;letter-spacing:1.4px;text-transform:uppercase;color:#b7afc6;font-weight:700;">Sua conta</div>
                <h1 style="margin:0;font-size:30px;line-height:1.2;color:#f5f3ff;">Confirme seu e-mail</h1>
                <p style="margin:16px auto 0;max-width:520px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#b7afc6;">Seu cadastro na ProxyBembem foi recebido. Confirme este endereço de e-mail para ativar sua conta e acessar seus pedidos.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 28px 34px;">
                <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;line-height:1;font-weight:700;padding:15px 24px;border-radius:10px;border:1px solid #8b5cf6;">Confirmar meu e-mail</a>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px;border-top:1px solid #332641;text-align:center;">
                <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#8f879f;">Se você não criou esta conta, pode ignorar este e-mail.</p>
                <p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#8f879f;">proxybembem.com.br</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Change email address

**Subject**

```text
Confirme seu novo e-mail — ProxyBembem
```

**Body**

```html
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#0b0912;font-family:Georgia,'Times New Roman',serif;color:#f5f3ff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#0b0912;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#15111f;border:1px solid #332641;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 20px;text-align:center;border-bottom:1px solid #332641;">
                <div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#8b5cf6;font-weight:700;">◆ ProxyBembem ◆</div>
                <div style="margin:14px auto 0;width:72px;height:2px;background:#8b5cf6;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 12px;text-align:center;">
                <div style="display:inline-block;margin-bottom:14px;padding:7px 12px;border:1px solid #332641;border-radius:999px;background:#1d1729;font-family:Arial,sans-serif;font-size:11px;line-height:1;letter-spacing:1.4px;text-transform:uppercase;color:#b7afc6;font-weight:700;">Segurança da conta</div>
                <h1 style="margin:0;font-size:30px;line-height:1.2;color:#f5f3ff;">Confirme seu novo e-mail</h1>
                <p style="margin:16px auto 0;max-width:520px;font-family:Arial,sans-serif;font-size:16px;line-height:1.7;color:#b7afc6;">Recebemos uma solicitação para alterar o e-mail da sua conta ProxyBembem. Use o botão abaixo para confirmar a alteração.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 28px 34px;">
                <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:15px;line-height:1;font-weight:700;padding:15px 24px;border-radius:10px;border:1px solid #8b5cf6;">Confirmar novo e-mail</a>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px;border-top:1px solid #332641;text-align:center;">
                <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#8f879f;">Se você não solicitou esta alteração, não confirme o link e revise a segurança da sua conta.</p>
                <p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#8f879f;">proxybembem.com.br</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

## Onde configurar

No Supabase Dashboard, abra **Authentication → Email Templates** e atualize somente os templates realmente usados pelo ProxyBembem:

- **Confirm signup**
- **Change email address**

A recuperação de senha do ProxyBembem não usa o template de reset do Supabase para envio ao cliente; ela é enviada pelo próprio aplicativo via Resend.

Após salvar os templates, faça um cadastro controlado e uma alteração de e-mail controlada para validar assunto, layout e callback antes de considerar a configuração concluída.
