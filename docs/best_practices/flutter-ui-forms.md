# UI y formularios Flutter

**Leer cuando:** se cree o cambie una pantalla, diálogo, formulario, lista, el tema, los textos o formatos de una app Flutter, o se revise su accesibilidad o adaptación a móvil y escritorio. Equivale a [UX](frontend-ux-forms.md): UX-1 a UX-8 aplican con estos widgets; capas en [FARCH](flutter-architecture.md).

## FUX-1. Widgets y recursos

- Una pantalla compone widgets pequeños con constructor `const`. Cada diálogo o sección con estado es su propio `StatefulWidget`, no un `_buildX()` de cientos de líneas ni un `StatefulBuilder`.
- La pantalla escucha solo lo que pinta (`ListenableBuilder` sobre ViewModel o comando, o `context.select`), nunca un `Consumer` de estado global en su raíz.
- `build` no filtra, ordena ni calcula: recibe datos listos del ViewModel (FARCH-2). `NumberFormat` y `DateFormat` se crean una vez por locale, no en cada `build`.
- Listas largas con `ListView.builder` o slivers; `shrinkWrap: true` dentro de otro scroll solo con listas cortas y acotadas.
- Timers, suscripciones y animaciones se cancelan en `dispose()`.

**Comprobación:** `rg "StatefulBuilder|NumberFormat|DateFormat"` dentro de métodos `build` queda vacío.

## FUX-2. Tema

- La UI usa `package:material_ui/material_ui.dart`; un proyecto existente migra con `dart fix --apply --code=migrate_design_widgets`, y si una dependencia aún importa `package:flutter/material.dart` (p. ej. `fl_chart` 1.2), `MaterialApp.builder` envuelve la app con `MaterialUiCompatibilityBridge`.
- Tema claro y oscuro desde `ColorScheme.fromSeed`, con `themeMode: ThemeMode.system` y elección manual guardada como preferencia (UX-6, FDB-8).
- Colores y tipografía de `Theme.of(context).colorScheme` y `textTheme`; tokens propios (éxito, advertencia, estados) en una `ThemeExtension` con valores claro y oscuro. Sin `Colors.*`, `Color(0x…)` ni `TextStyle(fontSize: …)` sueltos en features.
- El significado no depende solo del color: cada estado lleva texto o icono (FUX-5).

**Comprobación:** `rg "Colors\.|Color\(0x|fontSize:" lib/features` queda vacío.

## FUX-3. Formularios

- Cada formulario es un `StatefulWidget` que crea `TextEditingController`, `FocusNode` y `GlobalKey<FormState>` en `initState` y los libera en `dispose()`. Prohibido crearlos en la función que abre un diálogo: nunca se liberan.
- El `validator` llama a la misma función que el repositorio (`Money.tryParse`, `passwordPolicyViolation`, límites) y `maxLength` coincide con el esquema o la columna (UX-1). Números, horas y dinero con parsers del dominio, nunca `double.parse`: un valor inválido es error del campo, no excepción.
- `keyboardType`, `textInputAction` y `autofillHints` (`username`, `password`, `newPassword`) dentro de un `AutofillGroup`; las contraseñas permiten pegar y mostrar u ocultar.
- Al enviar: `validate()` y luego el comando, con el botón deshabilitado mientras `running` (UX-2). Los errores por campo (`VALIDATION_ERROR`) se muestran en su campo y el foco pasa al primero inválido (UX-7).

**Comprobación:** `rg "double\.parse" lib/features` queda vacío; un widget test con importe inválido muestra el error en el campo sin excepción.

## FUX-4. Estados

- Cada vista de datos pinta cargando, error con "Reintentar", vacío y contenido (UX-3); el vacío distingue "no hay datos" de "sin resultados con estos filtros".
- Una recarga conserva los datos visibles y muestra progreso con `semanticsLabel`.
- El error muestra el mensaje de su código (FARCH-5) y, si viene de la API, el `requestId` como código de soporte (LOG-3). Un error que bloquea la vista se queda en ella; `SnackBar` solo para confirmaciones o avisos breves.

**Comprobación (widget test con repositorio falso):** los cuatro estados se muestran y "Reintentar" recupera el contenido.

## FUX-5. Accesibilidad

- Todo control tiene nombre accesible: `IconButton` con `tooltip`, imágenes con `semanticLabel` y gráficas con resumen en `Semantics` o tabla alternativa.
- Áreas táctiles ≥ 48×48 y foco visible; en escritorio todo funciona con teclado (`Tab`, `Enter`, `Esc`) y las acciones frecuentes tienen atajos con `Shortcuts` y `Actions`.
- La UI se lee con texto al 200 % sin cortes ni desbordes; no se fija `textScaler`. Contraste 4.5:1 (3:1 para texto grande e iconos).

**Comprobación (widget test):** pasan `androidTapTargetGuideline`, `labeledTapTargetGuideline` y `textContrastGuideline`, y la pantalla con `TextScaler.linear(2)` no desborda.

## FUX-6. Adaptación

- El layout depende del ancho (`LayoutBuilder` o `MediaQuery.sizeOf`), no de la plataforma: compacto < 600 (una columna y `NavigationBar`), medio hasta 840 (`NavigationRail`) y expandido desde 840 (rail extendido y dos paneles).
- En escritorio: tamaño mínimo de ventana en el runner nativo, hover y cursores, menú contextual donde aporte, atajos y diálogos para formularios cortos.
- `Platform.is…` solo decide comportamiento propio (`Cmd`/`Ctrl`, rutas de archivos), nunca el layout.

**Comprobación:** widget tests a 400, 700 y 1200 de ancho muestran barra, rail y dos paneles; `rg "Platform\.is"` no aparece en widgets de layout.

## FUX-7. Localización

- Ningún texto visible se escribe en el widget: sale de `AppLocalizations`, generado por `gen-l10n` desde `lib/l10n/app_es.arb` (plantilla en el idioma de la interfaz), con `nullable-getter: false` en `l10n.yaml`.
- `MaterialApp` declara `localizationsDelegates` (`AppLocalizations.delegate`, `GlobalMaterialLocalizations.delegates` y los de `material_ui`) y `supportedLocales: AppLocalizations.supportedLocales`.
- Dinero con `NumberFormat.currency(locale: …, name: 'MXN')`, números con `NumberFormat.decimalPattern(locale)` y fechas con `DateFormat.yMMMd(locale)`; nunca `toStringAsFixed` ni `$` concatenado. Plurales y variables con ICU en el ARB, no concatenando cadenas.

**Comprobación:** `rg "Text\('" lib/features` y `rg "toStringAsFixed"` quedan vacíos.

## FUX-8. Destrucción y contabilidad

- La confirmación dice qué se pierde o cambia ("Se eliminarán 3 registros de destajo del lote L-12") con conteos del repositorio; la acción destructiva usa `colorScheme.error` y no es el botón por defecto.
- Si el repositorio bloquea la acción (turno en una nómina pagada), la UI explica el motivo con el mensaje de ese código (UX-8).
- Pagar, revertir o cancelar movimientos de dinero pide motivo cuando aplica y queda auditado en la misma transacción (FDB-4).
