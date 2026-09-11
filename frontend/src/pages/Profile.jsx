import { useState } from 'react';
import { Save, KeyRound } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime } from '../utils/format.js';
import { PageHeader } from '../components/ui/Misc.jsx';
import { TextInput } from '../components/ui/Field.jsx';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState({ full_name: user.full_name, phone: user.phone || '', avatar_url: user.avatar_url || '' });
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' });
  const [saving, setSaving] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/auth/profile', profile);
      updateUser({ ...user, ...res.data.user });
      toast.success('Perfil actualizado.');
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setSaving(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setChangingPwd(true);
    try {
      await api.post('/auth/change-password', passwords);
      toast.success('Contraseña actualizada. Debes iniciar sesión nuevamente.');
      setPasswords({ current_password: '', new_password: '' });
    } catch (err) { toast.error(apiErrorMessage(err)); } finally { setChangingPwd(false); }
  };

  const initials = user.full_name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div>
      <PageHeader title="Mi perfil" subtitle="Administra tu información personal" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-4 p-5">
          <div className="flex items-center gap-4">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">{initials}</div>
            )}
            <div>
              <p className="text-lg font-bold">{user.full_name}</p>
              <p className="text-sm text-slate-400">{user.email}</p>
              <p className="text-xs text-slate-400">Último acceso: {formatDateTime(user.last_login_at)}</p>
            </div>
          </div>
          <form onSubmit={saveProfile} className="space-y-4">
            <TextInput label="Nombre completo" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} />
            <TextInput label="Teléfono" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            <TextInput label="URL de avatar (opcional)" value={profile.avatar_url} onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })} />
            <button type="submit" className="btn-primary" disabled={saving}><Save className="h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar'}</button>
          </form>
        </div>

        <div className="card space-y-4 p-5">
          <h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5" /> Cambiar contraseña</h3>
          <form onSubmit={changePassword} className="space-y-4">
            <TextInput label="Contraseña actual" type="password" required value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} />
            <TextInput label="Nueva contraseña" type="password" required minLength={8} value={passwords.new_password} onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} />
            <button type="submit" className="btn-primary" disabled={changingPwd}>{changingPwd ? 'Cambiando...' : 'Cambiar contraseña'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
