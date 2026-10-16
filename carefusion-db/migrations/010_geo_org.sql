-- =====================================================================
-- 010_geo_org.sql : zones, states/UTs, districts, hospitals, departments,
--                   beds, pharmacies, master lists used by them
-- =====================================================================

-- ---------- Places ----------
CREATE TABLE geo.zone (
  id          smallint PRIMARY KEY,
  name        text NOT NULL UNIQUE CHECK (name IN ('North','South','East','West','Central'))
);

CREATE TABLE geo.state (
  id               smallint PRIMARY KEY,
  code             citext NOT NULL UNIQUE,              -- e.g. KL
  name             text NOT NULL UNIQUE,
  is_ut            boolean NOT NULL DEFAULT false,
  zone_id          smallint NOT NULL REFERENCES geo.zone(id),
  zone_changed_by  uuid,                                -- central admin (FK added in 090)
  zone_changed_at  timestamptz
);

CREATE TABLE geo.district (
  id          uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  state_id    smallint NOT NULL REFERENCES geo.state(id),
  name        text NOT NULL,
  lgd_code    text UNIQUE,                              -- Local Government Directory code (source to confirm)
  boundary    geometry(MultiPolygon, 4326),
  centre      geometry(Point, 4326),
  UNIQUE (state_id, name)
);
CREATE INDEX district_boundary_gix ON geo.district USING gist (boundary);

-- ---------- Master lists (managed by central admin) ----------
CREATE TABLE org.hospital_type (
  code        citext PRIMARY KEY,                       -- e.g. PHC, CHC, DH, MCH, PVT_MULTI
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE TABLE org.bed_type (
  code        citext PRIMARY KEY,                       -- general, icu, ...
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);

-- ---------- Hospitals ----------
CREATE TYPE org.ownership        AS ENUM ('govt','private');
CREATE TYPE org.facility_status  AS ENUM ('pending','active','suspended','closed');

CREATE TABLE org.hospital (
  id              uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hfr_id          text NOT NULL UNIQUE,                 -- HFR facility id (DEMO-… in alpha)
  name            text NOT NULL,
  ownership       org.ownership NOT NULL,
  hospital_type   citext NOT NULL REFERENCES org.hospital_type(code),
  district_id     uuid NOT NULL REFERENCES geo.district(id),
  address         text NOT NULL,
  location        geometry(Point, 4326) NOT NULL,
  geofence        geometry(Polygon, 4326) NOT NULL,     -- doctor location rule
  licence_no      text NOT NULL,                        -- clinical establishment registration
  phone           text,
  email           citext,
  timings         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          org.facility_status NOT NULL DEFAULT 'pending',
  approved_by     uuid,                                 -- district admin (FK in 090)
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_geofence_contains_pin CHECK (ST_Contains(geofence, location))
);
CREATE INDEX hospital_district_ix  ON org.hospital (district_id, status);
CREATE INDEX hospital_location_gix ON org.hospital USING gist (location);
CREATE INDEX hospital_geofence_gix ON org.hospital USING gist (geofence);
CREATE TRIGGER hospital_updated BEFORE UPDATE ON org.hospital
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

CREATE TABLE org.department (
  id           uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  hospital_id  uuid NOT NULL REFERENCES org.hospital(id),
  name         text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  UNIQUE (hospital_id, name)
);

CREATE TABLE org.bed_availability (
  hospital_id  uuid NOT NULL REFERENCES org.hospital(id),
  bed_type     citext NOT NULL REFERENCES org.bed_type(code),
  total        int NOT NULL CHECK (total >= 0),
  free         int NOT NULL CHECK (free >= 0),
  updated_by   uuid NOT NULL,                           -- hospital admin (FK in 090)
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, bed_type),
  CHECK (free <= total)
);
CREATE TRIGGER bed_updated BEFORE UPDATE ON org.bed_availability
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();

-- ---------- Pharmacies ----------
CREATE TYPE org.pharmacy_type AS ENUM ('govt_hospital','private');
CREATE TYPE org.stock_source  AS ENUM ('manual','software_sync');

CREATE TABLE org.pharmacy (
  id                  uuid PRIMARY KEY DEFAULT util.uuid_v7(),
  licence_no          text NOT NULL UNIQUE,             -- drug licence; checked vs state drug control / CDSCO
  name                text NOT NULL,
  pharmacy_type       org.pharmacy_type NOT NULL,
  linked_hospital_id  uuid REFERENCES org.hospital(id),
  district_id         uuid NOT NULL REFERENCES geo.district(id),
  address             text NOT NULL,
  location            geometry(Point, 4326) NOT NULL,
  opening_hours       jsonb NOT NULL DEFAULT '{}'::jsonb, -- {"mon":[["09:00","21:00"]], "holidays":[...]}
  stock_source        org.stock_source NOT NULL DEFAULT 'manual',
  status              org.facility_status NOT NULL DEFAULT 'pending',
  approved_by         uuid,
  approved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT govt_pharmacy_needs_hospital
    CHECK ((pharmacy_type = 'govt_hospital') = (linked_hospital_id IS NOT NULL))
);
CREATE INDEX pharmacy_location_gix ON org.pharmacy USING gist (location);
CREATE INDEX pharmacy_district_ix  ON org.pharmacy (district_id, status);
CREATE TRIGGER pharmacy_updated BEFORE UPDATE ON org.pharmacy
  FOR EACH ROW EXECUTE FUNCTION util.set_updated_at();
