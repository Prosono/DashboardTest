(function () {
  const PREFIX = "kur";
  const PREFIX_UPPER = "KUR";
  const DEFAULT_SYSTEM_NAME = "Smart Sauna Systems";
  const DEFAULT_TIMEZONE = "Europe/Oslo";
  const templateLibrary = window.SmartSaunaTemplateLibrary || {};

  const PRIMARY_FIELD_GROUPS = [
    {
      number: "02",
      title: "Det du vanligvis fyller inn",
      note: "Når KNX-filen er lastet opp, holder dette normalt for å generere hele pakken.",
      fields: [
        {
          path: "saunaName",
          label: "Badstunavn",
          description: "Navnet som vises i Home Assistant og i YAML-filene.",
          wide: true,
          placeholder: "Karistranda",
        },
        {
          path: "merchantId",
          label: "Merchant id",
          description: "Merchant-id fra Periode.",
          wide: true,
          placeholder: "FVxAA7cdkaY4uAZSa5T2",
        },
        {
          path: "manifestIds.felles",
          label: "Booking-id: felles",
          description: "Manifest-id for felles booking.",
          placeholder: "mOitXdky14sgWEjLk1MD",
        },
        {
          path: "manifestIds.privat",
          label: "Booking-id: privat",
          description: "Manifest-id for privat booking.",
          placeholder: "wvrXoyRHKswy8lkYXh7n",
        },
        {
          path: "manifestIds.aufguss",
          label: "Booking-id: aufguss",
          description: "Manifest-id for aufguss-bookinger.",
          placeholder: "qG5eAJdDP38U5eDiV0be",
        },
        {
          path: "manifestIds.service",
          label: "Booking-id: service",
          description: "Manifest-id som skal behandles som service i logikken.",
          placeholder: "service_manifest_id",
        },
      ],
    },
  ];

  const CONTROL_FIELD_GROUPS = [
    {
      number: "03",
      title: "Driftsinnstillinger for styring",
      note: "Her kan du justere de vanligste tallene i styring.yaml uten å redigere YAML manuelt.",
      fields: [
        {
          path: "controls.defaultBookingDurationMinutes",
          label: "Standard bookinglengde",
          description: "Brukes som fallback hvis Periode-data mangler gyldig varighet. Eksakt bookinglengde fra Periode brukes fortsatt når den finnes.",
          type: "select",
          wide: true,
          options: [
            { value: "60", label: "1 time" },
            { value: "75", label: "1 time 15 min" },
            { value: "90", label: "1 time 30 min" },
          ],
        },
        {
          path: "controls.preheatSetpointC",
          label: "Preheat temperatur",
          description: "Temperatur som settes ved oppvarming for vanlige bookinger.",
          feature: "climate",
          placeholder: "80",
          type: "number",
          min: 40,
          max: 110,
          step: 1,
        },
        {
          path: "controls.prestartLightsBeforeMinutes",
          label: "Lys på før booking",
          description: "Antall minutter før booking når minimumsbelysning skal slå seg på.",
          feature: "indoor-lights",
          placeholder: "10",
          type: "number",
          min: 0,
          max: 60,
          step: 1,
        },
        {
          path: "controls.prestartLightBrightnessPct",
          label: "Lysstyrke for booking",
          description: "Lysstyrke i badstu og garderobe før bookingstart.",
          feature: "indoor-lights",
          placeholder: "30",
          type: "number",
          min: 0,
          max: 100,
          step: 1,
        },
        {
          path: "controls.activeLightBrightnessPct",
          label: "Lys under vanlig booking",
          description: "Standard lysstyrke når vanlig booking starter.",
          feature: "indoor-lights",
          placeholder: "60",
          type: "number",
          min: 0,
          max: 100,
          step: 1,
        },
        {
          path: "controls.serviceLightBrightnessPct",
          label: "Lys under service",
          description: "Lysstyrke når systemet oppdager service-booking.",
          feature: "indoor-lights",
          placeholder: "100",
          type: "number",
          min: 0,
          max: 100,
          step: 1,
        },
        {
          path: "controls.outdoorLightBrightnessPct",
          label: "Utelys styrke",
          description: "Brukes når utelyset skal slås på i styringen.",
          feature: "outdoor-light",
          placeholder: "60",
          type: "number",
          min: 0,
          max: 100,
          step: 1,
        },
        {
          path: "controls.bookingStartReapplyDelayMinutes",
          label: "Re-apply etter start",
          description: "Minutter etter bookingstart for ny temperatur-apply.",
          feature: "climate",
          placeholder: "2",
          type: "number",
          min: 0,
          max: 30,
          step: 1,
        },
        {
          path: "controls.postBookingStep1DelayMinutes",
          label: "Etter booking trinn 1",
          description: "Hvor lenge etter avsluttet booking trinn 1 skal kjøre.",
          feature: "any-control",
          placeholder: "2",
          type: "number",
          min: 0,
          max: 60,
          step: 1,
        },
        {
          path: "controls.postBookingStep1BrightnessPct",
          label: "Lys i trinn 1",
          description: "Lysstyrke som brukes i etter-booking trinn 1.",
          feature: "indoor-lights",
          placeholder: "30",
          type: "number",
          min: 0,
          max: 100,
          step: 1,
        },
        {
          path: "controls.postBookingStep2DelayMinutes",
          label: "Etter booking trinn 2",
          description: "Når alt lys skal skrus helt av etter booking.",
          feature: "any-light",
          placeholder: "18",
          type: "number",
          min: 0,
          max: 180,
          step: 1,
        },
        {
          path: "controls.failsafeTempDeltaC",
          label: "Failsafe avvik",
          description: "Hvor mange grader under settpunktet som skal trigge releet.",
          feature: "heating-failsafe",
          placeholder: "5",
          type: "number",
          min: 1,
          max: 25,
          step: 1,
          wide: true,
        },
        {
          path: "controls.autoLockDelaySeconds",
          label: "Autolås forsinkelse",
          description: "Antall sekunder før ytterdøren låses etter opplåsing.",
          feature: "outer-door",
          placeholder: "10",
          type: "number",
          min: 0,
          max: 120,
          step: 1,
        },
        {
          path: "controls.autoLockFailsafeSeconds",
          label: "Autolås failsafe",
          description: "Hvor ofte systemet skal sjekke om ytterdøren fortsatt står ulåst.",
          feature: "outer-door",
          placeholder: "10",
          type: "number",
          min: 1,
          max: 300,
          step: 1,
        },
      ],
    },
  ];

  const ADVANCED_FIELD_GROUPS = [
    {
      number: "07",
      title: "Auto-fylte nøkler og id-er",
      note: "Disse settes automatisk fra badstunavn og KNX-fil, men kan overstyres hvis du må.",
      fields: [
        {
          path: "saunaSlug",
          label: "Slug",
          description: "Kort id i snake_case. Brukes i entity ids og webhook-navn.",
        },
        {
          path: "webhookId",
          label: "Webhook id",
          description: "Brukes av Home Assistant webhook-triggeren.",
        },
        {
          path: "calendarEntity",
          label: "Kalender-entity",
          description: "Målkalender for speiling av bookinger.",
        },
        {
          path: "periodeApiSecret",
          label: "Secret navn for API-nøkkel",
          description: "Brukes som !secret i REST-kallene.",
        },
        {
          path: "systemName",
          label: "Systemnavn",
          description: "Brukes i alarmer og presentasjonstekst.",
        },
        {
          path: "timezone",
          label: "Tidssone",
          description: "Standard er Europe/Oslo.",
        },
      ],
    },
    {
      number: "08",
      title: "Avledede Home Assistant-entiteter",
      note: "Generatoren prøver å hente disse fra KNX-navnene og lager resten som fornuftige standarder.",
      fields: [
        {
          path: "entities.mainTempSensor",
          label: "Sensor: hovedtemperatur",
          description: "Typisk basert på KNX-sensoren for badstu temperatur.",
        },
        {
          path: "entities.preheatTempSensor",
          label: "Sensor: preheat temperatur",
          description: "Bruker KNX-temperatursensoren når den finnes.",
        },
        {
          path: "entities.activeBinarySensor",
          label: "Binary sensor: aktiv nå",
          description: "Lages som standard entity-id hvis KNX-filen ikke inneholder den direkte.",
        },
        {
          path: "entities.serviceNowSensor",
          label: "Sensor: service nå",
          description: "Bygges automatisk fra badstuslug.",
        },
        {
          path: "entities.outerDoorLock",
          label: "Lock: ytterdør",
          description: "Tas bare med når KNX-filen inneholder ytterdør eller tilhørende relé.",
        },
        {
          path: "entities.bathDoorLock",
          label: "Lock: badedør",
          description: "Tas bare med når KNX-filen inneholder badstudør.",
        },
        {
          path: "entities.nextServiceSensor",
          label: "Sensor: neste booking er service",
          description: "Bygges automatisk fra badstuslug.",
          wide: true,
        },
        {
          path: "entities.saunaClimate",
          label: "Climate: badstu",
          description: "Avledes fra KNX climate-navn som inneholder badstu.",
        },
        {
          path: "entities.mainRelaySwitch",
          label: "Switch: hovedrelé",
          description: "Avledes fra KNX switch-navn som inneholder hovedrelé.",
        },
        {
          path: "entities.heaterRelaySwitch",
          label: "Switch: varmerelé",
          description: "Avledes fra KNX switch-navn som inneholder varmerelé.",
        },
        {
          path: "entities.saunaLight",
          label: "Light: lys badstu",
          description: "Avledes fra KNX light-navn som inneholder badstu.",
        },
        {
          path: "entities.wardrobeLight",
          label: "Light: lys garderobe",
          description: "Avledes fra KNX light-navn som inneholder garderobe.",
        },
        {
          path: "entities.outdoorLight",
          label: "Light: utelys",
          description: "Avledes fra KNX light-navn som inneholder ute.",
        },
      ],
    },
    {
      number: "09",
      title: "Valgfrie defaults",
      note: "Disse kan du la sta som de er hvis du ikke trenger spesialtilpasning.",
      fields: [
        {
          path: "notifyService",
          label: "Notify service",
          description: "Standard er notify.notify.",
        },
        {
          path: "hostNameSensor",
          label: "Host name-sensor",
          description: "Brukes i DNS-varsler.",
        },
        {
          path: "ignoreArea",
          label: "Ignorert område for alarmer",
          description: "Området som ignoreres i alarm-pakken.",
        },
        {
          path: "twilio.notifyName",
          label: "Twilio notify-navn",
          description: "Default bygges fra badstuslug.",
        },
        {
          path: "twilio.fromNumber",
          label: "Twilio fra-nummer",
          description: "Kan sta tomt til du setter opp SMS-delen.",
        },
        {
          path: "twilio.accountSidSecret",
          label: "Twilio secret: account sid",
          description: "Secret-navn, ikke selve verdien.",
        },
        {
          path: "twilio.authTokenSecret",
          label: "Twilio secret: auth token",
          description: "Secret-navn, ikke selve verdien.",
        },
        {
          path: "customerCode.textEntity",
          label: "Text entity: kundekode",
          description: "Avledes fra KNX hvis tekstobjektet finnes.",
        },
        {
          path: "customerCode.numberEntity",
          label: "Input number: kundekode",
          description: "Helper-entity for numerisk speiling av kundekode.",
        },
      ],
    },
  ];

  function createDefaultControls() {
    return {
      defaultBookingDurationMinutes: "60",
      preheatSetpointC: "80",
      prestartLightsBeforeMinutes: "10",
      prestartLightBrightnessPct: "30",
      activeLightBrightnessPct: "60",
      serviceLightBrightnessPct: "100",
      outdoorLightBrightnessPct: "60",
      bookingStartReapplyDelayMinutes: "2",
      postBookingStep1DelayMinutes: "2",
      postBookingStep1BrightnessPct: "30",
      postBookingStep2DelayMinutes: "18",
      failsafeTempDeltaC: "5",
      autoLockDelaySeconds: "10",
      autoLockFailsafeSeconds: "10",
    };
  }

  const KNX_GROUPS = [
    {
      key: "lights",
      title: "Lys",
      description: "Switch og eventuelle dimmeadresser for lys.",
      columns: [
        { key: "name", label: "Navn" },
        { key: "address", label: "Address" },
        { key: "stateAddress", label: "State address" },
        { key: "brightnessAddress", label: "Brightness address" },
        { key: "brightnessStateAddress", label: "Brightness state address" },
      ],
      yamlKey: "light",
    },
    {
      key: "fans",
      title: "Vifter",
      description: "Vifter med valgfri hastighetsstyring.",
      columns: [
        { key: "name", label: "Navn" },
        { key: "switchAddress", label: "Switch address" },
        { key: "switchStateAddress", label: "Switch state address" },
        { key: "address", label: "Address" },
        { key: "stateAddress", label: "State address" },
      ],
      yamlKey: "fan",
    },
    {
      key: "switches",
      title: "Switches",
      description: "Reléer og andre on/off-objekter.",
      columns: [
        { key: "name", label: "Navn" },
        { key: "address", label: "Address" },
        { key: "stateAddress", label: "State address" },
      ],
      yamlKey: "switch",
    },
    {
      key: "climates",
      title: "Climate",
      description: "Klimaobjekter med temperatur og on/off.",
      columns: [
        { key: "name", label: "Navn" },
        { key: "temperatureAddress", label: "Temperature address" },
        { key: "targetTemperatureAddress", label: "Target temp address" },
        { key: "targetTemperatureStateAddress", label: "Target temp state" },
        { key: "onOffAddress", label: "On/off address" },
        { key: "onOffStateAddress", label: "On/off state" },
        { key: "activeStateAddress", label: "Active state" },
        { key: "minTemp", label: "Min temp" },
        { key: "maxTemp", label: "Max temp" },
      ],
      yamlKey: "climate",
    },
    {
      key: "sensors",
      title: "Sensorer",
      description: "Vanlige sensorer, typisk temperatur eller ppm.",
      columns: [
        { key: "name", label: "Navn" },
        { key: "stateAddress", label: "State address" },
        { key: "type", label: "Type" },
        { key: "stateClass", label: "State class" },
      ],
      yamlKey: "sensor",
    },
    {
      key: "binarySensors",
      title: "Binary sensors",
      description: "Bevegelse, dør, sikkerhet og alarmer.",
      columns: [
        { key: "name", label: "Navn" },
        { key: "stateAddress", label: "State address" },
        { key: "deviceClass", label: "Device class" },
      ],
      yamlKey: "binary_sensor",
    },
    {
      key: "texts",
      title: "Tekstfelt",
      description: "Tekst-objekter som kundekode eller andre strenger.",
      columns: [
        { key: "name", label: "Navn" },
        { key: "address", label: "Address" },
        { key: "stateAddress", label: "State address" },
        { key: "type", label: "Type" },
        { key: "mode", label: "Mode" },
      ],
      yamlKey: "text",
    },
  ];

  const YAML_SECTION_MAP = {
    light: "lights",
    fan: "fans",
    switch: "switches",
    climate: "climates",
    sensor: "sensors",
    binary_sensor: "binarySensors",
    text: "texts",
  };

  const SAMPLE_KNX = {
    lights: [
      {
        name: "Utelys",
        address: "1/1/1",
        stateAddress: "1/2/1",
        brightnessAddress: "1/4/1",
        brightnessStateAddress: "1/5/1",
      },
      {
        name: "Lys garderobe",
        address: "1/1/4",
        stateAddress: "1/2/4",
        brightnessAddress: "",
        brightnessStateAddress: "",
      },
      {
        name: "Lys badstu",
        address: "1/1/5",
        stateAddress: "1/2/5",
        brightnessAddress: "",
        brightnessStateAddress: "",
      },
    ],
    fans: [
      {
        name: "Ventilasjon badstu",
        switchAddress: "1/1/16",
        switchStateAddress: "1/2/16",
        address: "1/4/16",
        stateAddress: "1/5/16",
      },
      {
        name: "Vifte teknisk rom",
        switchAddress: "1/1/10",
        switchStateAddress: "1/2/10",
        address: "",
        stateAddress: "",
      },
      {
        name: "Vifte garderobe",
        switchAddress: "1/1/17",
        switchStateAddress: "1/2/17",
        address: "",
        stateAddress: "",
      },
    ],
    switches: [
      { name: "Dusj relé", address: "1/1/18", stateAddress: "1/2/18" },
      { name: "Relé hoveddør", address: "1/1/20", stateAddress: "1/2/20" },
      { name: "Badstu termostat", address: "3/4/1", stateAddress: "4/4/1" },
      { name: "Panelovn termostat", address: "3/4/2", stateAddress: "4/4/2" },
      { name: "Frostsikring termostat", address: "3/4/3", stateAddress: "4/4/3" },
      { name: "Utematte termostat", address: "3/4/5", stateAddress: "4/4/5" },
      { name: "Badstu hovedrelé", address: "3/5/0", stateAddress: "4/5/0" },
      { name: "Badstu varmerelé", address: "3/5/1", stateAddress: "4/5/1" },
      { name: "Panelovn aktuator", address: "3/5/2", stateAddress: "4/5/2" },
      { name: "Frostsikring aktuator", address: "3/5/5", stateAddress: "4/5/8" },
      { name: "Utematte aktuator", address: "3/5/6", stateAddress: "4/5/9" },
    ],
    climates: [
      {
        name: "Badstu",
        temperatureAddress: "4/6/1",
        targetTemperatureAddress: "3/2/1",
        targetTemperatureStateAddress: "4/2/1",
        onOffAddress: "3/4/1",
        onOffStateAddress: "4/4/1",
        activeStateAddress: "4/5/1",
        minTemp: "0.0",
        maxTemp: "95.0",
      },
      {
        name: "Garderobe",
        temperatureAddress: "4/6/2",
        targetTemperatureAddress: "3/2/2",
        targetTemperatureStateAddress: "4/2/2",
        onOffAddress: "3/4/2",
        onOffStateAddress: "4/4/2",
        activeStateAddress: "4/5/2",
        minTemp: "10.0",
        maxTemp: "35.0",
      },
      {
        name: "Teknisk / Frostsikring",
        temperatureAddress: "4/6/4",
        targetTemperatureAddress: "3/2/3",
        targetTemperatureStateAddress: "4/2/3",
        onOffAddress: "3/4/3",
        onOffStateAddress: "4/4/3",
        activeStateAddress: "4/5/8",
        minTemp: "0.0",
        maxTemp: "25.0",
      },
      {
        name: "Utematte",
        temperatureAddress: "4/6/4",
        targetTemperatureAddress: "3/2/5",
        targetTemperatureStateAddress: "4/2/5",
        onOffAddress: "3/4/5",
        onOffStateAddress: "4/4/5",
        activeStateAddress: "4/5/9",
        minTemp: "-10.0",
        maxTemp: "20.0",
      },
    ],
    sensors: [
      { name: "Badstu temperatur", stateAddress: "4/6/1", type: "temperature", stateClass: "measurement" },
      { name: "Garderobe temperatur", stateAddress: "4/6/2", type: "temperature", stateClass: "measurement" },
      { name: "Teknisk temperatur", stateAddress: "4/6/7", type: "temperature", stateClass: "measurement" },
      { name: "Ute temperatur (luft)", stateAddress: "4/6/4", type: "temperature", stateClass: "measurement" },
      { name: "Ute temperatur (vann)", stateAddress: "4/6/3", type: "temperature", stateClass: "measurement" },
      { name: "Badstu CO2", stateAddress: "8/4/1", type: "ppm", stateClass: "measurement" },
    ],
    binarySensors: [
      { name: "Bevegelse garderobe", stateAddress: "8/1/1", deviceClass: "motion" },
      { name: "Tastatur aktivitet", stateAddress: "8/1/2", deviceClass: "occupancy" },
      { name: "Ytterdør", stateAddress: "9/1/1", deviceClass: "door" },
      { name: "Badstu dør", stateAddress: "9/1/2", deviceClass: "door" },
      { name: "Brannalarm", stateAddress: "9/1/3", deviceClass: "smoke" },
      { name: "Dusjknapp", stateAddress: "9/1/4", deviceClass: "occupancy" },
      { name: "Overoppheting", stateAddress: "9/1/5", deviceClass: "heat" },
      { name: "Sikkerhetsrelé", stateAddress: "4/5/5", deviceClass: "safety" },
      { name: "Temperatur-relé", stateAddress: "4/5/6", deviceClass: "safety" },
    ],
    texts: [
      { name: "Kunde kode", address: "0/2/4", stateAddress: "0/2/11", type: "string", mode: "text" },
    ],
  };

  function clone(value) {
    return structuredClone(value);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_{2,}/g, "_");
  }

  function normalizeName(value) {
    return slugify(value).replaceAll("_", " ");
  }

  function setByPath(target, path, value) {
    const keys = path.split(".");
    let ref = target;

    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const nextKey = keys[index + 1];
      const isArrayIndex = /^\d+$/.test(key);
      const parsedKey = isArrayIndex ? Number(key) : key;

      if (isLast) {
        ref[parsedKey] = value;
        return;
      }

      if (ref[parsedKey] == null) {
        ref[parsedKey] = /^\d+$/.test(nextKey) ? [] : {};
      }

      ref = ref[parsedKey];
    });
  }

  function getByPath(target, path) {
    return path.split(".").reduce((value, key) => {
      if (value == null) {
        return "";
      }
      return /^\d+$/.test(key) ? value[Number(key)] : value[key];
    }, target);
  }

  function createEmptyKnx() {
    return KNX_GROUPS.reduce((output, group) => {
      output[group.key] = [];
      return output;
    }, {});
  }

  function makeEmptyRow(group) {
    return group.columns.reduce((row, column) => {
      row[column.key] = "";
      return row;
    }, {});
  }

  function countConfiguredKnxItems(knx) {
    return KNX_GROUPS.reduce((count, group) => {
      const rows = knx[group.key] || [];
      return (
        count +
        rows.filter((row) => group.columns.some((column) => String(row[column.key] || "").trim())).length
      );
    }, 0);
  }

  function summarizeKnx(knx) {
    return KNX_GROUPS.reduce((summary, group) => {
      const count = (knx[group.key] || []).filter((row) =>
        group.columns.some((column) => String(row[column.key] || "").trim())
      ).length;
      if (count > 0) {
        summary.push(`${group.title}: ${count}`);
      }
      return summary;
    }, []);
  }

  function entityIdFromName(domain, name, fallback) {
    const slug = slugify(name);
    return slug ? `${domain}.${slug}` : fallback || "";
  }

  function findRowByKeywords(rows, keywordGroups) {
    return (
      rows.find((row) => {
        const haystack = normalizeName(row.name || "");
        return keywordGroups.some((group) => group.every((keyword) => haystack.includes(keyword)));
      }) || null
    );
  }

  function findKnxMatches(config) {
    const switches = config.knx.switches || [];
    const binarySensors = config.knx.binarySensors || [];
    const doorRows = [...switches, ...binarySensors];

    return {
      climateRow: findRowByKeywords(config.knx.climates || [], [["badstu"], ["sauna"]]),
      mainRelayRow: findRowByKeywords(switches, [
        ["badstu", "hoved"],
        ["sauna", "main"],
      ]),
      heaterRelayRow: findRowByKeywords(switches, [
        ["badstu", "varme"],
        ["sauna", "heat"],
        ["varme", "rele"],
        ["heater", "relay"],
      ]),
      saunaLightRow: findRowByKeywords(config.knx.lights || [], [["badstu"], ["sauna"]]),
      wardrobeLightRow: findRowByKeywords(config.knx.lights || [], [
        ["garderobe"],
        ["wardrobe"],
        ["changing", "room"],
      ]),
      outdoorLightRow: findRowByKeywords(config.knx.lights || [], [
        ["utelys"],
        ["ute", "lys"],
        ["outdoor"],
        ["exterior"],
      ]),
      tempRow: findRowByKeywords(config.knx.sensors || [], [
        ["badstu", "temperatur"],
        ["sauna", "temperature"],
      ]),
      customerTextRow: findRowByKeywords(config.knx.texts || [], [
        ["kunde", "kode"],
        ["customer", "code"],
        ["booking", "kode"],
      ]),
      outerDoorRow: findRowByKeywords(doorRows, [
        ["ytterdor"],
        ["hoveddor"],
        ["inngangsdor"],
        ["front", "door"],
        ["entrance", "door"],
      ]),
      bathDoorRow: findRowByKeywords(doorRows, [
        ["badstu", "dor"],
        ["badedor"],
        ["sauna", "door"],
      ]),
    };
  }

  function deriveEntitiesFromKnx(config) {
    const slug = slugify(config.saunaSlug || config.saunaName) || "badstue";
    const matches = findKnxMatches(config);
    const {
      climateRow,
      mainRelayRow,
      heaterRelayRow,
      saunaLightRow,
      wardrobeLightRow,
      outdoorLightRow,
      tempRow,
      customerTextRow,
      outerDoorRow,
      bathDoorRow,
    } = matches;

    return {
      saunaClimate: {
        value: entityIdFromName("climate", climateRow?.name),
        matched: Boolean(climateRow),
      },
      mainRelaySwitch: {
        value: entityIdFromName("switch", mainRelayRow?.name),
        matched: Boolean(mainRelayRow),
      },
      heaterRelaySwitch: {
        value: entityIdFromName("switch", heaterRelayRow?.name),
        matched: Boolean(heaterRelayRow),
      },
      saunaLight: {
        value: entityIdFromName("light", saunaLightRow?.name),
        matched: Boolean(saunaLightRow),
      },
      wardrobeLight: {
        value: entityIdFromName("light", wardrobeLightRow?.name),
        matched: Boolean(wardrobeLightRow),
      },
      outdoorLight: {
        value: entityIdFromName("light", outdoorLightRow?.name),
        matched: Boolean(outdoorLightRow),
      },
      mainTempSensor: {
        value: entityIdFromName("sensor", tempRow?.name),
        matched: Boolean(tempRow),
      },
      customerCodeText: {
        value: entityIdFromName("text", customerTextRow?.name),
        matched: Boolean(customerTextRow),
      },
      outerDoorLock: {
        value: outerDoorRow ? `lock.${slug}_dorlas_ytterdor` : "",
        matched: Boolean(outerDoorRow),
      },
      bathDoorLock: {
        value: bathDoorRow ? `lock.${slug}_dorlas_badedor` : "",
        matched: Boolean(bathDoorRow),
      },
    };
  }

  function detectKnxComponents(config) {
    const derived = deriveEntitiesFromKnx(config);
    const hasRows = (key) =>
      (config.knx[key] || []).some((row) =>
        Object.values(row).some((value) => String(value || "").trim())
      );
    const flags = {
      "sauna-light": derived.saunaLight.matched,
      "wardrobe-light": derived.wardrobeLight.matched,
      "outdoor-light": derived.outdoorLight.matched,
      climate: derived.saunaClimate.matched,
      "main-relay": derived.mainRelaySwitch.matched,
      "heater-relay": derived.heaterRelaySwitch.matched,
      "main-temperature": derived.mainTempSensor.matched,
      "customer-code": derived.customerCodeText.matched,
      "outer-door": derived.outerDoorLock.matched,
      "bath-door": derived.bathDoorLock.matched,
    };

    flags["indoor-lights"] = flags["sauna-light"] || flags["wardrobe-light"];
    flags["any-light"] = flags["indoor-lights"] || flags["outdoor-light"];
    flags["heating-failsafe"] =
      flags.climate &&
      flags["main-temperature"] &&
      (flags["main-relay"] || flags["heater-relay"]);
    flags["dynamic-preheat"] = flags.climate && flags["main-temperature"];
    flags["any-control"] = flags.climate || flags["any-light"];
    flags["door-control"] = flags["outer-door"] || flags["bath-door"];
    flags.monitoring = hasRows("sensors") || hasRows("binarySensors") || hasRows("climates");

    return {
      derived,
      flags,
      labels: [
        flags["indoor-lights"] ? "innelys" : "",
        flags["outdoor-light"] ? "utelys" : "",
        flags.climate ? "klima/varme" : "",
        flags["main-temperature"] ? "temperatur" : "",
        hasRows("fans") ? "vifter" : "",
        flags["door-control"] ? "dører/lås" : "",
        flags["customer-code"] ? "kundekode" : "",
        flags.monitoring ? "sensorovervåking" : "",
      ].filter(Boolean),
    };
  }

  function deriveSuggestedFields(config) {
    const slug = slugify(config.saunaSlug || config.saunaName) || "badstue";
    const entitySuggestions = deriveEntitiesFromKnx({ ...config, saunaSlug: slug });

    config.saunaSlug = slug;
    config.systemName = config.systemName || DEFAULT_SYSTEM_NAME;
    config.timezone = config.timezone || DEFAULT_TIMEZONE;
    config.webhookId = `periode_sauna_${slug}`;
    config.calendarEntity = `calendar.badstue_${slug}_periode`;
    config.periodeApiSecret = config.periodeApiSecret || "periode_api_key";
    config.notifyService = config.notifyService || "notify.notify";
    config.hostNameSensor = config.hostNameSensor || "sensor.host_name";
    config.ignoreArea = config.ignoreArea || "Test";

    config.entities.preheatTempSensor = entitySuggestions.mainTempSensor.value;
    config.entities.mainTempSensor = entitySuggestions.mainTempSensor.value;
    config.entities.activeBinarySensor = `binary_sensor.${slug}_badstu_aktiv_na`;
    config.entities.serviceNowSensor = `sensor.${slug}_service_na`;
    config.entities.nextServiceSensor = `sensor.${PREFIX}_${slug}_neste_booking_service`;
    config.entities.outerDoorLock = entitySuggestions.outerDoorLock.value;
    config.entities.bathDoorLock = entitySuggestions.bathDoorLock.value;
    config.entities.saunaClimate = entitySuggestions.saunaClimate.value;
    config.entities.mainRelaySwitch = entitySuggestions.mainRelaySwitch.value;
    config.entities.heaterRelaySwitch = entitySuggestions.heaterRelaySwitch.value;
    config.entities.saunaLight = entitySuggestions.saunaLight.value;
    config.entities.wardrobeLight = entitySuggestions.wardrobeLight.value;
    config.entities.outdoorLight = entitySuggestions.outdoorLight.value;

    config.twilio.notifyName = config.twilio.notifyName || `sms_${slug}`;
    config.twilio.accountSidSecret = config.twilio.accountSidSecret || "twilio_account_sid";
    config.twilio.authTokenSecret = config.twilio.authTokenSecret || "twilio_auth_token";

    config.customerCode.textEntity = entitySuggestions.customerCodeText.value;
    config.customerCode.numberEntity = config.customerCode.numberEntity || "input_number.kunde_kode_number";
  }

  function createSampleConfig() {
    const config = {
      saunaName: "Karistranda",
      saunaSlug: "karistranda",
      systemName: DEFAULT_SYSTEM_NAME,
      timezone: DEFAULT_TIMEZONE,
      merchantId: "FVxAA7cdkaY4uAZSa5T2",
      manifestIds: {
        felles: "mOitXdky14sgWEjLk1MD",
        privat: "wvrXoyRHKswy8lkYXh7n",
        aufguss: "qG5eAJdDP38U5eDiV0be",
        service: "service_manifest_demo_id",
      },
      webhookId: "periode_sauna_karistranda",
      calendarEntity: "calendar.badstue_karistranda_periode",
      periodeApiSecret: "periode_api_key",
      notifyService: "notify.notify",
      hostNameSensor: "sensor.host_name",
      ignoreArea: "Test",
      entities: {
        preheatTempSensor: "",
        mainTempSensor: "",
        activeBinarySensor: "",
        serviceNowSensor: "",
        nextServiceSensor: "",
        outerDoorLock: "",
        bathDoorLock: "",
        saunaClimate: "",
        mainRelaySwitch: "",
        heaterRelaySwitch: "",
        saunaLight: "",
        wardrobeLight: "",
        outdoorLight: "",
      },
      twilio: {
        notifyName: "",
        fromNumber: "+15706614870",
        accountSidSecret: "twilio_account_sid",
        authTokenSecret: "twilio_auth_token",
      },
      customerCode: {
        textEntity: "",
        numberEntity: "input_number.kunde_kode_number",
      },
      controls: createDefaultControls(),
      knx: clone(SAMPLE_KNX),
    };

    deriveSuggestedFields(config);
    return config;
  }

  function createBlankConfig() {
    const config = {
      saunaName: "",
      saunaSlug: "",
      systemName: DEFAULT_SYSTEM_NAME,
      timezone: DEFAULT_TIMEZONE,
      merchantId: "",
      manifestIds: {
        felles: "",
        privat: "",
        aufguss: "",
        service: "",
      },
      webhookId: "",
      calendarEntity: "",
      periodeApiSecret: "periode_api_key",
      notifyService: "notify.notify",
      hostNameSensor: "sensor.host_name",
      ignoreArea: "Test",
      entities: {
        preheatTempSensor: "",
        mainTempSensor: "",
        activeBinarySensor: "",
        serviceNowSensor: "",
        nextServiceSensor: "",
        outerDoorLock: "",
        bathDoorLock: "",
        saunaClimate: "",
        mainRelaySwitch: "",
        heaterRelaySwitch: "",
        saunaLight: "",
        wardrobeLight: "",
        outdoorLight: "",
      },
      twilio: {
        notifyName: "",
        fromNumber: "",
        accountSidSecret: "twilio_account_sid",
        authTokenSecret: "twilio_auth_token",
      },
      customerCode: {
        textEntity: "text.kunde_kode",
        numberEntity: "input_number.kunde_kode_number",
      },
      controls: createDefaultControls(),
      knx: createEmptyKnx(),
    };

    deriveSuggestedFields(config);
    return config;
  }

  function buildKnxImportMeta(source, fileName, error) {
    return {
      source,
      fileName,
      error,
    };
  }

  const state = {
    config: createSampleConfig(),
    activeFileId: "webhooks.yaml",
    files: [],
    diagnostics: [],
    knxImport: buildKnxImportMeta("demo", "Karistranda demo", ""),
  };

  const primaryFieldGroupsEl = document.getElementById("primary-field-groups");
  const styringFieldGroupsEl = document.getElementById("styring-field-groups");
  const advancedFieldGroupsEl = document.getElementById("advanced-field-groups");
  const knxGroupsEl = document.getElementById("knx-groups");
  const fileTabsEl = document.getElementById("file-tabs");
  const previewContentEl = document.getElementById("preview-content");
  const activeFileNameEl = document.getElementById("active-file-name");
  const activeFileSizeEl = document.getElementById("active-file-size");
  const summaryChipsEl = document.getElementById("summary-chips");
  const notesListEl = document.getElementById("notes-list");
  const knxImportStatusEl = document.getElementById("knx-import-status");
  const knxUploadEl = document.getElementById("knx-upload");
  const autofillGridEl = document.getElementById("autofill-grid");
  const readinessListEl = document.getElementById("readiness-list");
  const fileOverviewEl = document.getElementById("file-overview");
  const uploadDropzoneEl = document.getElementById("upload-dropzone");

  function renderFieldGroups(target, groups) {
    const componentFlags = detectKnxComponents(state.config).flags;
    target.innerHTML = groups
      .map((group) => {
        const visibleFields = group.fields.filter(
          (field) => !field.feature || componentFlags[field.feature]
        );
        const fields = visibleFields
          .map((field) => {
            const value = getByPath(state.config, field.path);
            const isSelect = field.type === "select";
            const inputType = field.type || "text";
            const inputMode = inputType === "number" ? ' inputmode="numeric"' : "";
            const min = field.min != null ? ` min="${field.min}"` : "";
            const max = field.max != null ? ` max="${field.max}"` : "";
            const step = field.step != null ? ` step="${field.step}"` : "";
            const controlMarkup = isSelect
              ? `
                <select
                  class="input-field input-select"
                  id="${field.path}"
                  data-path="${field.path}"
                >
                  ${(field.options || [])
                    .map((option) => {
                      const selected = String(option.value) === String(value) ? " selected" : "";
                      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
                    })
                    .join("")}
                </select>
              `
              : `
                <input
                  class="input-field"
                  id="${field.path}"
                  data-path="${field.path}"
                  type="${inputType}"
                  value="${escapeHtml(value)}"
                  placeholder="${escapeHtml(field.placeholder || "")}"
                  autocomplete="off"
                  ${inputMode}${min}${max}${step}
                />
              `;
            return `
              <div class="field ${field.wide ? "field-wide" : ""}">
                <label for="${field.path}">${escapeHtml(field.label)}</label>
                ${controlMarkup}
                <small>${escapeHtml(field.description)}</small>
              </div>
            `;
          })
          .join("");

        return `
          <section class="panel section-card animate-in">
            <div class="section-head">
              <div>
                <p class="section-number">${group.number}</p>
                <h2>${escapeHtml(group.title)}</h2>
              </div>
              <p class="section-note">${escapeHtml(group.note)}</p>
            </div>
            <div class="section-grid">
              ${fields}
            </div>
          </section>
        `;
      })
      .join("");
  }

  function renderKnxGroups() {
    knxGroupsEl.innerHTML = KNX_GROUPS.map((group) => {
      const rows = state.config.knx[group.key] || [];
      const headers = group.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
      const body = rows
        .map((row, index) => {
          const cells = group.columns
            .map((column) => {
              const path = `knx.${group.key}.${index}.${column.key}`;
              return `
                <td>
                  <input
                    class="input-field"
                    data-path="${path}"
                    value="${escapeHtml(row[column.key] || "")}"
                    autocomplete="off"
                  />
                </td>
              `;
            })
            .join("");

          return `
            <tr>
              ${cells}
              <td>
                <button
                  class="button button-ghost remove-row"
                  type="button"
                  data-action="remove-row"
                  data-group="${group.key}"
                  data-index="${index}"
                >
                  Fjern
                </button>
              </td>
            </tr>
          `;
        })
        .join("");

      const emptyState = rows.length
        ? ""
        : `
          <tr>
            <td colspan="${group.columns.length + 1}">
              Ingen rader enda. Last opp KNX-filen eller legg til rad manuelt.
            </td>
          </tr>
        `;

      return `
        <section class="knx-group">
          <div class="knx-group-head">
            <div>
              <h3>${escapeHtml(group.title)}</h3>
              <p class="section-note">${escapeHtml(group.description)}</p>
            </div>
            <button
              class="button"
              type="button"
              data-action="add-row"
              data-group="${group.key}"
            >
              Legg til rad
            </button>
          </div>
          <div class="table-shell">
            <table>
              <thead>
                <tr>
                  ${headers}
                  <th>Rad</th>
                </tr>
              </thead>
              <tbody>
                ${body || emptyState}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }).join("");
  }

  function refreshInputValues() {
    document.querySelectorAll("[data-path]").forEach((input) => {
      const value = getByPath(state.config, input.dataset.path);
      input.value = value == null ? "" : value;
    });
  }

  function renderKnxImportStatus() {
    if (state.knxImport.error) {
      knxImportStatusEl.innerHTML = `<strong>Import feilet.</strong><br>${escapeHtml(state.knxImport.error)}`;
      return;
    }

    const summary = summarizeKnx(state.config.knx);
    const components = detectKnxComponents(state.config);
    const detected = [
      state.config.entities.saunaClimate,
      state.config.entities.mainRelaySwitch,
      state.config.entities.heaterRelaySwitch,
      state.config.entities.saunaLight,
      state.config.entities.wardrobeLight,
      state.config.entities.outdoorLight,
      state.config.entities.mainTempSensor,
    ]
      .filter(Boolean)
      .join(", ");

    if (state.knxImport.fileName) {
      knxImportStatusEl.innerHTML = `
        <strong>${escapeHtml(state.knxImport.fileName)}</strong><br>
        ${escapeHtml(summary.join(" • ") || "Ingen KNX-objekter funnet")}<br>
        Komponenter i pakken: ${escapeHtml(components.labels.join(", ") || "kun booking og integrasjoner")}<br>
        Auto-fylte entiteter: ${escapeHtml(detected || "ingen fysiske styringsentiteter")}
      `;
      return;
    }

    knxImportStatusEl.innerHTML =
      "Ingen KNX-fil lastet opp enda. Du kan fortsatt generere YAML ved a fylle inn avansert manuelt, men malet er at KNX-filen skal gjøre mesteparten av jobben.";
  }

  function buildAutofillCards() {
    const derived = deriveEntitiesFromKnx(state.config);
    const cards = [
      {
        label: "Climate for badstu",
        value: state.config.entities.saunaClimate,
        matched: derived.saunaClimate.matched,
      },
      {
        label: "Hovedrelé",
        value: state.config.entities.mainRelaySwitch,
        matched: derived.mainRelaySwitch.matched,
      },
      {
        label: "Varmerelé",
        value: state.config.entities.heaterRelaySwitch,
        matched: derived.heaterRelaySwitch.matched,
      },
      {
        label: "Temperatursensor",
        value: state.config.entities.mainTempSensor,
        matched: derived.mainTempSensor.matched,
      },
      {
        label: "Lys i badstu",
        value: state.config.entities.saunaLight,
        matched: derived.saunaLight.matched,
      },
      {
        label: "Webhook id",
        value: state.config.webhookId,
        matched: Boolean(state.config.webhookId),
        autoLabel: "Auto",
      },
      {
        label: "Kalender-entity",
        value: state.config.calendarEntity,
        matched: Boolean(state.config.calendarEntity),
        autoLabel: "Auto",
      },
      {
        label: "Service-sensor",
        value: state.config.entities.serviceNowSensor,
        matched: Boolean(state.config.entities.serviceNowSensor),
        autoLabel: "Standard",
      },
      {
        label: "Lås ytterdør",
        value: state.config.entities.outerDoorLock,
        matched: derived.outerDoorLock.matched,
      },
      {
        label: "Lås badedør",
        value: state.config.entities.bathDoorLock,
        matched: derived.bathDoorLock.matched,
      },
      {
        label: "Kundekode tekst",
        value: state.config.customerCode.textEntity,
        matched: derived.customerCodeText.matched,
      },
    ];

    autofillGridEl.innerHTML = cards
      .map((card) => {
        const toneClass = card.matched ? "is-good" : "is-muted";
        const toneText = card.matched ? "Funnet" : card.autoLabel || "Ikke med";
        return `
          <article class="insight-card">
            <div class="insight-top">
              <p class="insight-label">${escapeHtml(card.label)}</p>
              <span class="status-pill ${toneClass}">${escapeHtml(toneText)}</span>
            </div>
            <p class="insight-value">${escapeHtml(card.value || "Ikke satt")}</p>
          </article>
        `;
      })
      .join("");
  }

  function renderReadiness(issues) {
    const components = detectKnxComponents(state.config);
    const componentSummary =
      components.labels.length > 0
        ? `Pakken tilpasses automatisk med ${components.labels.join(", ")}. Komponenter som mangler i KNX blir utelatt.`
        : "Ingen fysiske styringskomponenter ble gjenkjent. Booking- og integrasjonsfilene kan fortsatt genereres.";

    const items = [
      {
        title: "KNX-filen er lest",
        body: state.knxImport.fileName
          ? `${state.knxImport.fileName} er importert og ${countConfiguredKnxItems(state.config.knx)} KNX-objekter er registrert.`
          : "Last opp KNX-filen for å hente inn objekter og auto-fylle entiteter.",
        ok: Boolean(state.knxImport.fileName),
        badge: state.knxImport.fileName ? "Klar" : "Mangler",
      },
      {
        title: "Kjernefeltene er fylt ut",
        body: `${countRequiredCompleted(state.config)} av ${REQUIRED_PATHS.length} nødvendige felt er satt.`,
        ok: countRequiredCompleted(state.config) === REQUIRED_PATHS.length,
        badge: `${countRequiredCompleted(state.config)}/${REQUIRED_PATHS.length}`,
      },
      {
        title: "Pakken følger KNX-innholdet",
        body: componentSummary,
        ok: Boolean(state.knxImport.fileName),
        badge: `${components.labels.length} funnet`,
      },
      {
        title: "YAML-pakken kan eksporteres",
        body: issues.length === 0
          ? `${state.files.length} filer er klare til nedlasting.`
          : `${issues.length} punkt trenger fortsatt oppmerksomhet før alt er helt rent.`,
        ok: issues.length === 0,
        badge: issues.length === 0 ? "Ren" : `${issues.length} hull`,
      },
    ];

    readinessListEl.innerHTML = items
      .map((item) => {
        const toneClass = item.ok ? "is-good" : "is-warn";
        return `
          <article class="readiness-item">
            <span class="status-dot ${toneClass}"></span>
            <div class="readiness-copy">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.body)}</span>
            </div>
            <span class="status-pill ${toneClass}">${escapeHtml(item.badge)}</span>
          </article>
        `;
      })
      .join("");
  }

  function renderFileOverview() {
    const totalLines = state.files.reduce((sum, file) => sum + lineCount(file.content), 0);
    const activeFile = state.files.find((file) => file.id === state.activeFileId) || state.files[0];
    const overview = [
      {
        label: "Pakke",
        value: `${state.files.length} filer`,
      },
      {
        label: "Total mengde",
        value: `${totalLines} linjer`,
      },
      {
        label: "Valgt fil",
        value: activeFile ? activeFile.id : "Ingen",
      },
      {
        label: "Status",
        value: state.diagnostics.length ? `${state.diagnostics.length} sjekkpunkt` : "Klar til eksport",
      },
    ];

    fileOverviewEl.innerHTML = overview
      .map(
        (item) => `
          <div class="file-stat">
            <p class="meta-label">${escapeHtml(item.label)}</p>
            <strong>${escapeHtml(item.value)}</strong>
          </div>
        `
      )
      .join("");
  }

  function quoteYaml(value) {
    return `"${String(value ?? "").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }

  function formatYamlScalar(value, forceQuote) {
    const text = String(value ?? "").trim();
    if (!text) {
      return "";
    }
    return forceQuote ? quoteYaml(text) : text;
  }

  function clampInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(String(value ?? "").trim(), 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  function normalizeDefaultBookingDuration(value) {
    const allowed = new Set([60, 75, 90]);
    const parsed = Number.parseInt(String(value ?? "").trim(), 10);
    return allowed.has(parsed) ? parsed : 60;
  }

  function normalizeControls(rawControls) {
    const controls = rawControls || {};
    return {
      defaultBookingDurationMinutes: normalizeDefaultBookingDuration(controls.defaultBookingDurationMinutes),
      preheatSetpointC: clampInteger(controls.preheatSetpointC, 80, 40, 110),
      prestartLightsBeforeMinutes: clampInteger(controls.prestartLightsBeforeMinutes, 10, 0, 60),
      prestartLightBrightnessPct: clampInteger(controls.prestartLightBrightnessPct, 30, 0, 100),
      activeLightBrightnessPct: clampInteger(controls.activeLightBrightnessPct, 60, 0, 100),
      serviceLightBrightnessPct: clampInteger(controls.serviceLightBrightnessPct, 100, 0, 100),
      outdoorLightBrightnessPct: clampInteger(controls.outdoorLightBrightnessPct, 60, 0, 100),
      bookingStartReapplyDelayMinutes: clampInteger(controls.bookingStartReapplyDelayMinutes, 2, 0, 30),
      postBookingStep1DelayMinutes: clampInteger(controls.postBookingStep1DelayMinutes, 2, 0, 60),
      postBookingStep1BrightnessPct: clampInteger(controls.postBookingStep1BrightnessPct, 30, 0, 100),
      postBookingStep2DelayMinutes: clampInteger(controls.postBookingStep2DelayMinutes, 18, 0, 180),
      failsafeTempDeltaC: clampInteger(controls.failsafeTempDeltaC, 5, 1, 25),
      autoLockDelaySeconds: clampInteger(controls.autoLockDelaySeconds, 10, 0, 120),
      autoLockFailsafeSeconds: clampInteger(controls.autoLockFailsafeSeconds, 10, 1, 300),
    };
  }

  function buildKnxSection(items, schema) {
    const filtered = items.filter((item) =>
      schema.columns.some((column) => String(item[column.key] || "").trim())
    );

    if (!filtered.length) {
      return "";
    }

    const lines = [`  ${schema.yamlKey}:`];
    filtered.forEach((item) => {
      lines.push(`  - name: ${quoteYaml(item.name || "")}`);
      schema.columns.forEach((column) => {
        if (column.key === "name") {
          return;
        }
        const value = formatYamlScalar(item[column.key], false);
        if (!value) {
          return;
        }
        const yamlKey = column.key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
        lines.push(`    ${yamlKey}: ${value}`);
      });
    });
    return lines.join("\n");
  }

  function buildKnxYaml(config) {
    const sections = KNX_GROUPS.map((group) =>
      buildKnxSection(config.knx[group.key] || [], group)
    ).filter(Boolean);
    return sections.length ? `knx:\n\n${sections.join("\n\n")}\n` : "knx: {}\n";
  }

  function buildSmsYaml(config) {
    return `twilio:
  account_sid: !secret ${config.twilio.accountSidSecret}
  auth_token: !secret ${config.twilio.authTokenSecret}

notify:
  - name: ${config.twilio.notifyName}
    platform: twilio_sms
    from_number: ${quoteYaml(config.twilio.fromNumber || "+00000000000")}
`;
  }

  function buildPreheatYaml(config) {
    const prefixSlug = `${PREFIX}_${config.saunaSlug}`;
    return `###############################################################################
# Optional manual preheat override for ${config.saunaName}
###############################################################################

input_boolean:
  ${prefixSlug}_manual_preheat_override:
    name: "${config.saunaName} manuell preheat override"
    icon: mdi:hand-back-right

input_number:
  ${prefixSlug}_manual_preheat_minutes:
    name: "${config.saunaName} manuell preheat (min)"
    min: 0
    max: 120
    step: 5
    unit_of_measurement: "min"

automation:
  - id: ${prefixSlug}_manual_preheat_override
    alias: "${PREFIX_UPPER} | ${config.saunaName} – manuell preheat override"
    mode: restart
    trigger:
      - platform: state
        entity_id:
          - input_boolean.${prefixSlug}_manual_preheat_override
          - input_number.${prefixSlug}_manual_preheat_minutes
    condition:
      - condition: state
        entity_id: input_boolean.${prefixSlug}_manual_preheat_override
        state: "on"
    action:
      - service: input_number.set_value
        data:
          entity_id: input_number.${prefixSlug}_preheat_window_minutes
          value: "{{ states('input_number.${prefixSlug}_manual_preheat_minutes') | int(0) }}"
`;
  }

  function renderTemplate(template, tokens) {
    return Object.entries(tokens).reduce((output, [key, value]) => {
      return output.split(`__${key}__`).join(value);
    }, template);
  }

  function createTokenMap(config) {
    const controls = normalizeControls(config.controls);
    return {
      PREFIX,
      PREFIX_UPPER,
      PREFIX_SLUG: `${PREFIX}_${config.saunaSlug}`,
      SAUNA_NAME: config.saunaName,
      SAUNA_SLUG: config.saunaSlug,
      SYSTEM_NAME: config.systemName,
      SYSTEM_SLUG: slugify(config.systemName || DEFAULT_SYSTEM_NAME),
      TIMEZONE: config.timezone,
      MERCHANT_ID: config.merchantId,
      FELLES_MANIFEST_ID: config.manifestIds.felles,
      PRIVAT_MANIFEST_ID: config.manifestIds.privat,
      AUFGUSS_MANIFEST_ID: config.manifestIds.aufguss,
      SERVICE_MANIFEST_ID: config.manifestIds.service,
      DEFAULT_BOOKING_DURATION_MINUTES: String(controls.defaultBookingDurationMinutes),
      WEBHOOK_ID: config.webhookId,
      CALENDAR_ENTITY: config.calendarEntity,
      PERIODE_API_SECRET: config.periodeApiSecret,
      ENTITY_PREHEAT_TEMP_SENSOR: config.entities.preheatTempSensor,
      ENTITY_MAIN_TEMP_SENSOR: config.entities.mainTempSensor,
      ENTITY_ACTIVE_BINARY_SENSOR: config.entities.activeBinarySensor,
      ENTITY_SERVICE_NOW_SENSOR: config.entities.serviceNowSensor,
      ENTITY_NEXT_SERVICE_SENSOR: config.entities.nextServiceSensor,
      ENTITY_OUTER_DOOR_LOCK: config.entities.outerDoorLock,
      ENTITY_BATH_DOOR_LOCK: config.entities.bathDoorLock,
      ENTITY_SAUNA_CLIMATE: config.entities.saunaClimate,
      ENTITY_MAIN_RELAY_SWITCH: config.entities.mainRelaySwitch,
      ENTITY_HEATER_RELAY_SWITCH: config.entities.heaterRelaySwitch,
      ENTITY_FAILSAFE_RELAY_SWITCH:
        config.entities.mainRelaySwitch || config.entities.heaterRelaySwitch,
      ENTITY_SAUNA_LIGHT: config.entities.saunaLight,
      ENTITY_WARDROBE_LIGHT: config.entities.wardrobeLight,
      ENTITY_OUTDOOR_LIGHT: config.entities.outdoorLight,
      NOTIFY_SERVICE: config.notifyService,
      HOSTNAME_SENSOR: config.hostNameSensor,
      IGNORE_AREA: config.ignoreArea,
      CUSTOMER_CODE_TEXT_ENTITY: config.customerCode.textEntity,
      CUSTOMER_CODE_NUMBER_ENTITY: config.customerCode.numberEntity,
    };
  }

  function unresolvedTokens(text) {
    return Array.from(new Set(text.match(/__[A-Z0-9_]+__/g) || []));
  }

  function filterTemplateByFeatures(template, flags) {
    const activeStack = [true];
    const output = [];

    template.split("\n").forEach((line) => {
      const ifMatch = line.match(/^\s*#\s*@if\s+([a-z0-9-]+)\s*$/i);
      if (ifMatch) {
        const parentActive = activeStack[activeStack.length - 1];
        activeStack.push(parentActive && Boolean(flags[ifMatch[1]]));
        return;
      }

      if (/^\s*#\s*@endif\s*$/i.test(line)) {
        if (activeStack.length > 1) {
          activeStack.pop();
        }
        return;
      }

      if (activeStack[activeStack.length - 1]) {
        output.push(line);
      }
    });

    return output.join("\n").replace(/\n{4,}/g, "\n\n\n");
  }

  function insertAfter(content, marker, insertion) {
    if (!marker || !content.includes(marker) || content.includes(insertion.trim())) {
      return content;
    }
    return content.replace(marker, `${marker}${insertion}`);
  }

  function insertBefore(content, marker, insertion) {
    if (!marker || !content.includes(marker) || content.includes(insertion.trim())) {
      return content;
    }
    return content.replace(marker, `${insertion}${marker}`);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function replaceFirstLiteral(content, search, replacement) {
    const index = content.indexOf(search);
    if (index === -1) {
      return content;
    }
    return `${content.slice(0, index)}${replacement}${content.slice(index + search.length)}`;
  }

  function replaceWithinAutomation(content, automationId, transform) {
    const pattern = new RegExp(
      `(^|\\n)(  - id: ${escapeRegExp(automationId)}[\\s\\S]*?)(?=\\n\\n  ##############################################################################|\\n\\s*$)`
    );

    return content.replace(pattern, (match, prefix, block) => `${prefix}${transform(block)}`);
  }

  function formatMinuteDelay(minutes) {
    return `00:${String(minutes).padStart(2, "0")}:00`;
  }

  function formatSecondDelay(seconds) {
    return `00:00:${String(seconds).padStart(2, "0")}`;
  }

  function buildServiceRestCommand(config) {
    return `\n\n  periode_get_bookings_${config.saunaSlug}_service:
    url: >-
      https://europe-west1-periode-prod.cloudfunctions.net/merchantApi/merchants/${config.merchantId}/getBookings/${config.manifestIds.service}/{{ date }}
    method: GET
    headers:
      x-api-key: !secret ${config.periodeApiSecret}
      Accept: application/json
    timeout: 30`;
  }

  function buildServiceListVariable(variableName, responseVariable, indent) {
    const pad = " ".repeat(indent);
    return `\n${pad}${variableName}: >
${pad}  {% set c = ${responseVariable}.content %}
${pad}  {% if c is string %}
${pad}    {% set fixed = c
${pad}        | replace("'", '"')
${pad}        | replace(': True', ': true')
${pad}        | replace(': False', ': false')
${pad}        | replace(': None', ': null') %}
${pad}    {{ fixed | from_json(default=[]) }}
${pad}  {% elif c %}
${pad}    {{ c }}
${pad}  {% else %}
${pad}    []
${pad}  {% endif %}
`;
  }

  function buildServiceQueueLoop(listName, indent, defaultDurationMinutes) {
    const pad = " ".repeat(indent);
    return `\n${pad}{# SERVICE – is_service = true #}
${pad}{% for b in ${listName} %}
${pad}  {% set date_str = b.date %}
${pad}  {% set time_raw = b.time | default(0) %}
${pad}  {% set length_raw = b.length if b.length is defined else ${defaultDurationMinutes} %}
${pad}  {% set q = b.quantity | int(1) %}
${pad}  {% set is_service = true %}

${pad}  {% set name = (
${pad}       b.user.name
${pad}       if b.user is defined and b.user.name is defined and b.user.name
${pad}       else (b.user.email if b.user is defined and b.user.email is defined else 'Ukjent kunde')
${pad}     ) %}

${pad}  {% set raw_time = (time_raw ~ '') | replace(',', '.') | trim %}
${pad}  {% if raw_time in ['unknown','unavailable','','none','None'] %}
${pad}    {% set start_minutes = 0 %}
${pad}  {% elif ':' in raw_time %}
${pad}    {% set parts = raw_time.split(':') %}
${pad}    {% set start_minutes = ((parts[0] | int(0)) * 60) + (parts[1] | int(0)) %}
${pad}  {% elif '.' in raw_time %}
${pad}    {% set parts = raw_time.split('.') %}
${pad}    {% set h = parts[0] | int(0) %}
${pad}    {% set fraction = parts[1] | default('0', true) %}
${pad}    {% if fraction | length == 2 and (fraction | int(0)) <= 59 and ((fraction | int(0)) % 15 == 0) %}
${pad}      {% set start_minutes = (h * 60) + (fraction | int(0)) %}
${pad}    {% else %}
${pad}      {% set start_minutes = ((raw_time | float(0)) * 60) | round(0) | int %}
${pad}    {% endif %}
${pad}  {% else %}
${pad}    {% set start_minutes = (raw_time | int(0)) * 60 %}
${pad}  {% endif %}

${pad}  {% set raw_length = (length_raw ~ '') | replace(',', '.') | trim %}
${pad}  {% if raw_length in ['unknown','unavailable','','none','None'] %}
${pad}    {% set duration_minutes = ${defaultDurationMinutes} %}
${pad}  {% elif ':' in raw_length %}
${pad}    {% set parts = raw_length.split(':') %}
${pad}    {% set duration_minutes = ((parts[0] | int(0)) * 60) + (parts[1] | int(0)) %}
${pad}  {% elif '.' in raw_length %}
${pad}    {% set parts = raw_length.split('.') %}
${pad}    {% set h = parts[0] | int(0) %}
${pad}    {% set fraction = parts[1] | default('0', true) %}
${pad}    {% if fraction | length == 2 and (fraction | int(0)) <= 59 and ((fraction | int(0)) % 15 == 0) %}
${pad}      {% set duration_minutes = (h * 60) + (fraction | int(0)) %}
${pad}    {% else %}
${pad}      {% set hours_float = raw_length | float(-1) %}
${pad}      {% if hours_float < 0 %}
${pad}        {% set duration_minutes = ${defaultDurationMinutes} %}
${pad}      {% else %}
${pad}        {% set duration_minutes = (hours_float * 60) | round(0) | int %}
${pad}      {% endif %}
${pad}    {% endif %}
${pad}  {% else %}
${pad}    {% set duration_minutes = raw_length | int(${defaultDurationMinutes}) %}
${pad}  {% endif %}

${pad}  {% set ts_start = as_timestamp(date_str ~ 'T00:00:00') + ((start_minutes | int(0)) * 60) %}
${pad}  {% set ts_end = ts_start + ((duration_minutes | int(${defaultDurationMinutes})) * 60) %}

${pad}  {% if b.state in ['booked', 'confirmed'] and ts_end > as_timestamp(nowt) %}
${pad}    {% set raw.items = raw.items + [{
${pad}      'ts_start': ts_start,
${pad}      'ts_end': ts_end,
${pad}      'names': [name],
${pad}      'pax': q,
${pad}      'is_service': is_service
${pad}    }] %}
${pad}  {% endif %}
${pad}{% endfor %}
`;
  }

  function enhanceWebhooks(content, config) {
    return content.replace(
      `{{ raw.bookingManifestId == '${config.manifestIds.aufguss}' }}`,
      `{{ raw.bookingManifestId == '${config.manifestIds.service}' }}`
    );
  }

  function enhanceApiPeriode(content, config) {
    const controls = normalizeControls(config.controls);
    const aufgussRestCommand = `  periode_get_bookings_${config.saunaSlug}_aufguss:
    url: >-
      https://europe-west1-periode-prod.cloudfunctions.net/merchantApi/merchants/${config.merchantId}/getBookings/${config.manifestIds.aufguss}/{{ date }}
    method: GET
    headers:
      x-api-key: !secret ${config.periodeApiSecret}
      Accept: application/json
    timeout: 30`;

    const aufgussCall = `      - service: rest_command.periode_get_bookings_${config.saunaSlug}_aufguss
        data:
          date: "{{ today }}"
        response_variable: kari_aufguss_resp`;

    content = insertAfter(content, aufgussRestCommand, buildServiceRestCommand(config));
    content = insertAfter(
      content,
      aufgussCall,
      `\n\n      - service: rest_command.periode_get_bookings_${config.saunaSlug}_service
        data:
          date: "{{ today }}"
        response_variable: kari_service_resp`
    );
    content = insertBefore(content, `\n          queue: >-`, buildServiceListVariable("kari_service_list", "kari_service_resp", 10));
    content = insertBefore(
      content,
      `\n            {# --- SLÅ SAMMEN ALLE ELEMENTER MED SAMME ts_start --- #}`,
      buildServiceQueueLoop("kari_service_list", 12, controls.defaultBookingDurationMinutes)
    );
    return content;
  }

  function enhanceKalender(content, config) {
    const controls = normalizeControls(config.controls);
    const aufgussRestCommand = `  periode_get_bookings_${config.saunaSlug}_aufguss:
    url: >-
      https://europe-west1-periode-prod.cloudfunctions.net/merchantApi/merchants/${config.merchantId}/getBookings/${config.manifestIds.aufguss}/{{ date }}
    method: GET
    headers:
      x-api-key: !secret ${config.periodeApiSecret}
      Accept: application/json
    timeout: 30`;

    const aufgussCall = `            - service: rest_command.periode_get_bookings_${config.saunaSlug}_aufguss
              data:
                date: "{{ day }}"
              response_variable: kari_aufguss_resp`;

    content = insertAfter(content, aufgussRestCommand, buildServiceRestCommand(config));
    content = insertAfter(
      content,
      aufgussCall,
      `\n\n            - service: rest_command.periode_get_bookings_${config.saunaSlug}_service
              data:
                date: "{{ day }}"
              response_variable: kari_service_resp`
    );
    content = insertBefore(content, `\n                raw: >-`, buildServiceListVariable("service_list", "kari_service_resp", 16));
    content = content.replace(
      `{'list': privat_list,  'label': 'Privat',   'is_aufguss': false},
                    {'list': aufguss_list, 'label': 'Aufguss',  'is_aufguss': true}`,
      `{'list': privat_list,  'label': 'Privat',   'is_aufguss': false},
                    {'list': service_list, 'label': 'Service',  'is_aufguss': false},
                    {'list': aufguss_list, 'label': 'Aufguss',  'is_aufguss': true}`
    );
    return content;
  }

  function enhanceStyring(content, config) {
    const controls = normalizeControls(config.controls);
    const prefixSlug = `${PREFIX}_${config.saunaSlug}`;

    content = replaceWithinAutomation(content, `${prefixSlug}_badstu_preheat`, (block) =>
      block.replaceAll("temperature: 80", `temperature: ${controls.preheatSetpointC}`)
    );

    content = replaceWithinAutomation(content, `${prefixSlug}_badstu_10min_light`, (block) => {
      let updated = block.replace(
        /alias: "([^"]+) – 10 min før"/,
        `alias: "$1 – ${controls.prestartLightsBeforeMinutes} min før"`
      );
      updated = updated.replace(
        /\(\(next_in - \d+\) \| abs\)/,
        `((next_in - ${controls.prestartLightsBeforeMinutes}) | abs)`
      );
      updated = replaceFirstLiteral(
        updated,
        "brightness_pct: 30",
        `brightness_pct: ${controls.prestartLightBrightnessPct}`
      );
      updated = replaceFirstLiteral(
        updated,
        "brightness_pct: 30",
        `brightness_pct: ${controls.prestartLightBrightnessPct}`
      );
      return updated;
    });

    content = replaceWithinAutomation(content, `${prefixSlug}_badstu_10min_blink`, (block) =>
      replaceFirstLiteral(
        block,
        "brightness_pct: 60",
        `brightness_pct: ${controls.outdoorLightBrightnessPct}`
      )
    );

    content = replaceWithinAutomation(content, `${prefixSlug}_badstu_start_time`, (block) => {
      let updated = replaceFirstLiteral(
        block,
        "brightness_pct: 100",
        `brightness_pct: ${controls.serviceLightBrightnessPct}`
      );
      updated = replaceFirstLiteral(
        updated,
        "brightness_pct: 60",
        `brightness_pct: ${controls.activeLightBrightnessPct}`
      );
      updated = replaceFirstLiteral(
        updated,
        "brightness_pct: 60",
        `brightness_pct: ${controls.outdoorLightBrightnessPct}`
      );
      updated = replaceFirstLiteral(
        updated,
        'delay: "00:02:00"',
        `delay: "${formatMinuteDelay(controls.bookingStartReapplyDelayMinutes)}"`
      );
      updated = updated.replaceAll("temperature: 80", `temperature: ${controls.preheatSetpointC}`);
      return updated;
    });

    content = replaceWithinAutomation(content, `${prefixSlug}_badstu_after_no_next_step1`, (block) => {
      let updated = block.replace(
        /diff_sec >= \d+\s*}}/,
        `diff_sec >= ${controls.postBookingStep1DelayMinutes * 60} }}`
      );
      updated = replaceFirstLiteral(
        updated,
        "brightness_pct: 30",
        `brightness_pct: ${controls.postBookingStep1BrightnessPct}`
      );
      updated = replaceFirstLiteral(
        updated,
        "brightness_pct: 30",
        `brightness_pct: ${controls.postBookingStep1BrightnessPct}`
      );
      return updated;
    });

    content = replaceWithinAutomation(content, `${prefixSlug}_badstu_after_no_next_step2`, (block) =>
      block.replace(
        /diff_sec >= \d+\s*}}/,
        `diff_sec >= ${controls.postBookingStep2DelayMinutes * 60} }}`
      )
    );

    content = replaceWithinAutomation(content, `${prefixSlug}_badstu_thermostat_failsafe_on_if_active`, (block) =>
      block.replace(/setpoint - \d+/, `setpoint - ${controls.failsafeTempDeltaC}`)
    );

    content = content.replace(
      "current < (setpoint - 5)",
      `current < (setpoint - ${controls.failsafeTempDeltaC})`
    );

    return content;
  }

  function enhanceAutolaasing(content, config) {
    const controls = normalizeControls(config.controls);

    let updated = content.replaceAll("10 sek", `${controls.autoLockDelaySeconds} sek`);
    updated = updated.replace('seconds: "/10"', `seconds: "/${controls.autoLockFailsafeSeconds}"`);
    updated = updated.replace('delay: "00:00:10"', `delay: "${formatSecondDelay(controls.autoLockDelaySeconds)}"`);
    return updated;
  }

  function enhanceGeneratedFile(fileId, content, config) {
    if (fileId === "webhooks.yaml") {
      return enhanceWebhooks(content, config);
    }
    if (fileId === "api_periode.yaml") {
      return enhanceApiPeriode(content, config);
    }
    if (fileId === "kalender.yaml") {
      return enhanceKalender(content, config);
    }
    if (fileId === "styring.yaml") {
      return enhanceStyring(content, config);
    }
    if (fileId === "autolaasing.yaml") {
      return enhanceAutolaasing(content, config);
    }
    return content;
  }

  function generateFiles(config) {
    const components = detectKnxComponents(config);
    const tokens = createTokenMap(config);
    const files = [
      { id: "webhooks.yaml", label: "webhooks.yaml", template: templateLibrary.webhooks || "" },
      { id: "api_periode.yaml", label: "api_periode.yaml", template: templateLibrary.apiPeriode || "" },
      { id: "kalender.yaml", label: "kalender.yaml", template: templateLibrary.kalender || "" },
      {
        id: "styring.yaml",
        label: "styring.yaml",
        template: templateLibrary.styring || "",
        feature: "any-control",
      },
      {
        id: "autolaasing.yaml",
        label: "autolaasing.yaml",
        template: templateLibrary.autolaasing || "",
        feature: "door-control",
      },
      { id: "template_sensors.yaml", label: "template_sensors.yaml", template: templateLibrary.templateSensors || "" },
      {
        id: "text_til_tall_converter.yaml",
        label: "text_til_tall_converter.yaml",
        template: templateLibrary.textToNumber || "",
        feature: "customer-code",
      },
      { id: "dns.yaml", label: "dns.yaml", template: templateLibrary.dns || "" },
      {
        id: "alarm_package_global.yaml",
        label: "alarm_package_global.yaml",
        template: templateLibrary.alarmPackageGlobal || "",
        feature: "monitoring",
      },
    ]
      .filter((file) => !file.feature || components.flags[file.feature])
      .map((file) => {
        const conditionedTemplate = filterTemplateByFeatures(file.template, components.flags);
        const rendered = renderTemplate(conditionedTemplate, tokens);
        return {
          id: file.id,
          label: file.label,
          content: enhanceGeneratedFile(file.id, rendered, config),
        };
      });

    files.push({ id: "knxproject.yaml", label: "knxproject.yaml", content: buildKnxYaml(config) });
    files.push({ id: "sms.yaml", label: "sms.yaml", content: buildSmsYaml(config) });
    if (components.flags.climate) {
      files.push({ id: "preheat.yaml", label: "preheat.yaml", content: buildPreheatYaml(config) });
    }

    const diagnostics = files.flatMap((file) =>
      unresolvedTokens(file.content).map((token) => `${file.id}: mangler verdi for ${token}`)
    );

    return { files, diagnostics };
  }

  const REQUIRED_PATHS = [
    "saunaName",
    "merchantId",
    "manifestIds.felles",
    "manifestIds.privat",
    "manifestIds.aufguss",
    "manifestIds.service",
  ];

  function countRequiredCompleted(config) {
    return REQUIRED_PATHS.filter((path) => String(getByPath(config, path) || "").trim()).length;
  }

  function validateConfig(config, diagnostics) {
    const checks = [
      ["saunaName", "Badstunavn mangler."],
      ["merchantId", "Merchant id mangler."],
      ["manifestIds.felles", "Booking-id for felles mangler."],
      ["manifestIds.privat", "Booking-id for privat mangler."],
      ["manifestIds.aufguss", "Booking-id for aufguss mangler."],
      ["manifestIds.service", "Booking-id for service mangler."],
    ];

    const issues = checks
      .filter(([path]) => !String(getByPath(config, path) || "").trim())
      .map(([, message]) => message);

    if (countConfiguredKnxItems(config.knx) === 0) {
      issues.push("KNX-filen er ikke importert enda.");
    }

    return [...issues, ...diagnostics];
  }

  function downloadTextFile(filename, content) {
    if (window.parent !== window) {
      window.parent.postMessage(
        {
          type: "smart-sauna-config-generator:download",
          filename,
          content,
        },
        "*"
      );
      return;
    }
    const blob = new Blob([content], { type: "text/yaml;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function lineCount(content) {
    return content ? content.split("\n").length : 0;
  }

  function formatBookingDurationLabel(value) {
    const duration = normalizeDefaultBookingDuration(value);
    if (duration === 75) {
      return "1 t 15 min";
    }
    if (duration === 90) {
      return "1 t 30 min";
    }
    return "1 t";
  }

  function renderSummary(issues) {
    const requiredDone = countRequiredCompleted(state.config);
    const knxCount = countConfiguredKnxItems(state.config.knx);
    const chips = [
      {
        label: "KNX-kilde",
        value: state.knxImport.fileName || "Ikke lastet opp",
      },
      {
        label: "Kjernefelt",
        value: `${requiredDone}/${REQUIRED_PATHS.length}`,
      },
      {
        label: "KNX-objekter",
        value: String(knxCount),
      },
      {
        label: "Standardlengde",
        value: formatBookingDurationLabel(state.config.controls?.defaultBookingDurationMinutes),
      },
      {
        label: "Åpne hull",
        value: String(issues.length),
      },
    ];

    summaryChipsEl.innerHTML = chips
      .map(
        (chip) => `
          <div class="summary-chip">
            <p class="eyebrow">${escapeHtml(chip.label)}</p>
            <strong>${escapeHtml(chip.value)}</strong>
          </div>
        `
      )
      .join("");
  }

  function renderNotes(issues) {
    const components = detectKnxComponents(state.config);
    const notes = [
      "Last opp KNX-filen først. Da fyller generatoren inn KNX-tabellene og foreslår entity ids automatisk.",
      components.labels.length
        ? `KNX-filen gir pakken: ${components.labels.join(", ")}. Alt annet fysisk utstyr utelates automatisk.`
        : "Ingen fysiske KNX-komponenter er gjenkjent, så pakken inneholder bare booking og uavhengige integrasjoner.",
      "Du trenger normalt bare badstunavn, merchant id og fire booking-id-er for å generere filene.",
      "Standard bookinglengde kan nå velges som 1 time, 1 time 15 min eller 1 time 30 min, og brukes som fallback hvis Periode ikke sender en gyldig varighet.",
      "Driftsinnstillinger lar deg endre vanlige hardkodede verdier i styring.yaml, som temperatur, lysnivå og forsinkelser.",
      "autolaasing.yaml tas bare med når KNX-filen viser ytterdør eller badstudør.",
      "Avansert oppsett er fortsatt tilgjengelig hvis KNX-navnene dine avviker fra standardene.",
      "Service-manifestet behandles separat fra aufguss i den genererte logikken.",
      "preheat.yaml tas bare med når badstu-climate er funnet i KNX-filen.",
    ];

    issues.forEach((issue) => notes.unshift(issue));
    notesListEl.innerHTML = notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("");
  }

  function renderTabs() {
    fileTabsEl.innerHTML = state.files
      .map((file) => {
        const active = file.id === state.activeFileId ? "active" : "";
        return `
          <button class="tab-button ${active}" type="button" data-file-id="${file.id}">
            ${escapeHtml(file.label)}
          </button>
        `;
      })
      .join("");
  }

  function renderPreview() {
    const activeFile = state.files.find((file) => file.id === state.activeFileId) || state.files[0];
    if (!activeFile) {
      previewContentEl.textContent = "";
      activeFileNameEl.textContent = "Ingen filer";
      activeFileSizeEl.textContent = "0 linjer";
      return;
    }

    state.activeFileId = activeFile.id;
    activeFileNameEl.textContent = activeFile.id;
    activeFileSizeEl.textContent = `${lineCount(activeFile.content)} linjer`;
    previewContentEl.textContent = activeFile.content;
  }

  function renderOutputs() {
    const generated = generateFiles(state.config);
    state.files = generated.files;
    state.diagnostics = validateConfig(state.config, generated.diagnostics);
    renderSummary(state.diagnostics);
    buildAutofillCards();
    renderReadiness(state.diagnostics);
    renderPreview();
    renderTabs();
    renderFileOverview();
    renderNotes(state.diagnostics);
    renderKnxImportStatus();
  }

  function renderAllForms() {
    renderFieldGroups(primaryFieldGroupsEl, PRIMARY_FIELD_GROUPS);
    renderFieldGroups(styringFieldGroupsEl, CONTROL_FIELD_GROUPS);
    renderFieldGroups(advancedFieldGroupsEl, ADVANCED_FIELD_GROUPS);
    renderKnxGroups();
  }

  function parseYamlScalar(rawValue) {
    const value = rawValue.trim();
    if (!value) {
      return "";
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }

  function snakeToCamel(value) {
    return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function parseKnxYaml(text) {
    const knx = createEmptyKnx();
    let currentSection = null;
    let currentItem = null;

    const lines = text.replaceAll("\t", "  ").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.replace(/\s+$/g, "");
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || trimmed === "knx:") {
        continue;
      }

      const sectionMatch = line.match(/^\s{0,2}(light|fan|switch|climate|sensor|binary_sensor|text):\s*$/);
      if (sectionMatch) {
        currentSection = YAML_SECTION_MAP[sectionMatch[1]];
        currentItem = null;
        continue;
      }

      const itemMatch = line.match(/^\s{2,4}-\s*([a-z_]+):\s*(.*)$/);
      if (itemMatch && currentSection) {
        currentItem = {};
        knx[currentSection].push(currentItem);
        currentItem[snakeToCamel(itemMatch[1])] = parseYamlScalar(itemMatch[2]);
        continue;
      }

      const propertyMatch = line.match(/^\s{4,6}([a-z_]+):\s*(.*)$/);
      if (propertyMatch && currentItem) {
        currentItem[snakeToCamel(propertyMatch[1])] = parseYamlScalar(propertyMatch[2]);
      }
    }

    if (countConfiguredKnxItems(knx) === 0) {
      throw new Error("Fant ingen KNX-objekter i filen. Sjekk at du lastet opp en KNX-YAML i samme stil som knxproject.yaml.");
    }

    return knx;
  }

  async function importKnxFile(file) {
    try {
      const text = await file.text();
      state.config.knx = parseKnxYaml(text);
      deriveSuggestedFields(state.config);
      state.knxImport = buildKnxImportMeta("upload", file.name, "");
      renderAllForms();
      renderOutputs();
    } catch (error) {
      state.knxImport = buildKnxImportMeta("", "", error instanceof Error ? error.message : "Ukjent feil ved import.");
      renderKnxImportStatus();
    }
  }

  let renderQueued = false;

  function scheduleOutputRender() {
    if (renderQueued) {
      return;
    }
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderOutputs();
    });
  }

  function handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const path = target.dataset.path;
    if (!path) {
      return;
    }

    let value = target.value;
    if (path === "saunaSlug") {
      value = slugify(value);
      target.value = value;
    }

    setByPath(state.config, path, value);
    if (path === "saunaName") {
      state.config.saunaSlug = slugify(value);
      deriveSuggestedFields(state.config);
    }
    scheduleOutputRender();
  }

  function handleChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const path = target.dataset.path;
    if (path && (path === "saunaName" || path === "saunaSlug" || path.startsWith("knx."))) {
      if (path === "saunaName") {
        state.config.saunaSlug = slugify(state.config.saunaName);
      }
      deriveSuggestedFields(state.config);
      renderAllForms();
      renderOutputs();
      return;
    }

    if (target === knxUploadEl && knxUploadEl.files?.[0]) {
      importKnxFile(knxUploadEl.files[0]);
      knxUploadEl.value = "";
    }
  }

  function handleButtonClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const addButton = target.closest("[data-action='add-row']");
    if (addButton) {
      const groupKey = addButton.dataset.group;
      const schema = KNX_GROUPS.find((group) => group.key === groupKey);
      if (!schema) {
        return;
      }
      state.config.knx[groupKey].push(makeEmptyRow(schema));
      renderKnxGroups();
      renderOutputs();
      return;
    }

    const removeButton = target.closest("[data-action='remove-row']");
    if (removeButton) {
      const groupKey = removeButton.dataset.group;
      const index = Number(removeButton.dataset.index);
      if (!Number.isFinite(index)) {
        return;
      }
      state.config.knx[groupKey].splice(index, 1);
      deriveSuggestedFields(state.config);
      renderKnxGroups();
      renderOutputs();
      return;
    }

    const tabButton = target.closest("[data-file-id]");
    if (tabButton) {
      state.activeFileId = tabButton.dataset.fileId;
      renderTabs();
      renderPreview();
      return;
    }

    if (
      target.id === "pick-knx-file" ||
      target.id === "pick-knx-file-inline" ||
      target.id === "upload-dropzone"
    ) {
      knxUploadEl.click();
      return;
    }

    if (target.id === "apply-autofill") {
      deriveSuggestedFields(state.config);
      refreshInputValues();
      renderOutputs();
      return;
    }

    if (target.id === "load-sample") {
      state.config = createSampleConfig();
      state.knxImport = buildKnxImportMeta("demo", "Karistranda demo", "");
      renderAllForms();
      renderOutputs();
      return;
    }

    if (target.id === "load-blank") {
      state.config = createBlankConfig();
      state.knxImport = buildKnxImportMeta("", "", "");
      renderAllForms();
      renderOutputs();
      return;
    }

    if (target.id === "download-all") {
      state.files.forEach((file, index) => {
        window.setTimeout(() => downloadTextFile(file.id, file.content), index * 160);
      });
      return;
    }

    if (target.id === "download-current") {
      const activeFile = state.files.find((file) => file.id === state.activeFileId);
      if (activeFile) {
        downloadTextFile(activeFile.id, activeFile.content);
      }
      return;
    }

    if (target.id === "copy-current") {
      const activeFile = state.files.find((file) => file.id === state.activeFileId);
      if (!activeFile) {
        return;
      }
      const showCopied = () => {
        target.textContent = "Kopiert";
        window.setTimeout(() => {
          target.textContent = "Kopier aktiv fil";
        }, 1400);
      };
      if (window.parent !== window) {
        window.parent.postMessage(
          {
            type: "smart-sauna-config-generator:copy",
            content: activeFile.content,
          },
          "*"
        );
        showCopied();
        return;
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(activeFile.content).then(showCopied);
      }
      return;
    }

    if (target.id === "export-profile") {
      downloadTextFile(
        `${state.config.saunaSlug || "sauna"}-profile.json`,
        JSON.stringify(state.config, null, 2)
      );
    }
  }

  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("click", handleButtonClick);

  if (uploadDropzoneEl) {
    uploadDropzoneEl.addEventListener("dragover", (event) => {
      event.preventDefault();
      uploadDropzoneEl.classList.add("is-dragover");
    });

    uploadDropzoneEl.addEventListener("dragleave", () => {
      uploadDropzoneEl.classList.remove("is-dragover");
    });

    uploadDropzoneEl.addEventListener("drop", (event) => {
      event.preventDefault();
      uploadDropzoneEl.classList.remove("is-dragover");
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        importKnxFile(file);
      }
    });
  }

  renderAllForms();
  renderOutputs();
})();
