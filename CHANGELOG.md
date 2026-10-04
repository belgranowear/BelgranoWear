# Changelog

## 3.0.1

### Cambios

- Los indicadores de carga que quedaban (horario completo, viaje, próximo tren y reloj) usan el nuevo indicador de Material 3 Expressive.
- Las builds de release se optimizan y ofuscan con R8, y el archivo de desofuscación (`mapping.txt`) queda junto a los artefactos.

## 3.0.0

Rediseño completo con Material 3 Expressive, funciones nuevas para planificar el viaje y soporte de primera clase para relojes Wear OS.

### Nuevo

- **Horario completo:** todas las salidas del día, agrupadas por hora, con selector Hábiles / Sábados / Domingos y feriados, primer y último tren, línea "Ahora" y botón para volver a la hora actual.
- **Viaje completo:** hora de salida y de llegada, duración, cantidad de paradas y la hora de paso por cada estación intermedia, con la posición estimada del tren.
- **¿Llego?:** estimación aproximada de cuánto tardás caminando hasta la estación y si llegás al próximo tren, con aviso de cuándo salir.
- **Recordatorios semanales:** elegí ruta, días, hora y anticipación (5, 10 o 15 minutos). Se gestionan desde Ajustes → Recordatorios, con switches para activarlos o pausarlos.
- **Rutina sugerida:** si hacés un viaje seguido, la app te propone crear un recordatorio semanal. Nunca se crea solo, y "Ahora no" la oculta para siempre.
- **Seguir viaje:** notificación persistente con el progreso del viaje y widgets para la pantalla de inicio del teléfono.
- **Wear OS:** Tile con el próximo tren, complicaciones para la esfera, actividad en curso mientras seguís un viaje y scroll con la corona o el bisel giratorio.

### Cambios

- Nuevo tema Material 3 Expressive generado a partir del rojo Ferrovías, en modo claro y oscuro (negro OLED en el reloj).
- Selector de destino rediseñado: encabezado unificado, origen compacto con "Cambiar", Favoritos y Recientes separados, e íconos Material.
- Pantalla de próximo tren rediseñada: hora grande, indicador de si el dato es en vivo o del horario, tabla de salidas y botón de aviso con anticipación.
- Pantallas de inicio y de carga nuevas. Mientras se busca señal GPS, la app lo dice y ofrece elegir el origen a mano.
- Tablets y escritorio: diseño en dos paneles y anchos máximos legibles en Ajustes y Acerca de.
- Textos en español revisados, con voseo y sin errores de tipeo.

### Reloj

- Diseño pensado para pantallas redondas y cuadradas: listas que se agrandan en el centro y se atenúan hacia los bordes, hora curva arriba, botón principal pegado al borde inferior e indicador de scroll curvo.
- El contenido se desvanece bajo la hora y el botón inferior en lugar de asomarse alrededor.
- Diálogos de confirmación, mensajes, pantallas de error y editor de recordatorios adaptados para que entren completos en la pantalla redonda.
- El origen detectado aparece centrado y en tamaño completo al abrir la app.

### Arreglos

- El scroll ahora funciona en la versión web.
- La ubicación en el reloj pide una señal precisa con más tiempo de espera y ya no falla por el chequeo de Play Services, que Wear OS rechaza.
- Si la ubicación del dispositivo está apagada, la app lo avisa en lugar de mostrar un error genérico.

### Notas para Play Store

**Teléfonos, tablets y escritorio (es-419)**

```
Versión 3.0: la app tiene un diseño completamente nuevo, con Material 3 Expressive.

• Horario completo del día, con primer y último tren
• Viaje con todas las paradas y su hora de paso
• ¿Llego?: estimación de cuánto tardás caminando a la estación
• Recordatorios semanales y rutinas sugeridas
• Seguimiento del viaje con notificación y widgets
• Diseño en dos paneles para tablets
```

**Wear OS (es-419)**

```
Versión 3.0: la app tiene un diseño completamente nuevo para Wear OS.

• Pantallas adaptadas a relojes redondos y cuadrados
• Tile con el próximo tren y complicaciones para la esfera
• Scroll con la corona o el bisel giratorio
• Horario completo y viaje con todas las paradas
• Recordatorios semanales
• Seguimiento del viaje como actividad en curso
```
