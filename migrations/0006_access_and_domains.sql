BEGIN;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS edit_all boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS workspace_settings (
 organization_id text PRIMARY KEY REFERENCES organizations(id),
 owner_id text NOT NULL REFERENCES auth_user(id),
 public_read boolean NOT NULL DEFAULT true
);
INSERT INTO workspace_settings(organization_id,owner_id)
SELECT organization_id,min(user_id) FROM memberships WHERE role='deputy' AND active=true GROUP BY organization_id HAVING count(*)=1
ON CONFLICT DO NOTHING;
UPDATE domains SET name=CASE id WHEN 'safety' THEN 'סמ״פים' WHEN 'people' THEN 'סמ״פים' WHEN 'maintenance' THEN 'טנ״א' WHEN 'medical' THEN 'רפואה' WHEN 'infrastructure' THEN 'בינוי' ELSE name END;
INSERT INTO domains(id,organization_id,name,color)
SELECT o.id || ':' || d.id,o.id,d.name,d.color FROM organizations o CROSS JOIN (VALUES
 ('deputies','סמ״פים','#d49245'),('communications','תקשוב','#8877b5'),('maintenance','טנ״א','#688bba'),('logistics','לוגיסטיקה','#358c85'),('infrastructure','בינוי','#7b9273'),('transport','הובלות','#5e95a4'),('medical','רפואה','#c1778d'),('armory','נשקייה ותחמושת','#967348')
) d(id,name,color) WHERE NOT EXISTS(SELECT 1 FROM domains x WHERE x.organization_id=o.id AND (x.id=d.id OR x.id=o.id || ':' || d.id)) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS workspace_access_grants (
 user_id text PRIMARY KEY REFERENCES auth_user(id), organization_id text NOT NULL REFERENCES organizations(id),
 granted_by text NOT NULL REFERENCES auth_user(id), created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
