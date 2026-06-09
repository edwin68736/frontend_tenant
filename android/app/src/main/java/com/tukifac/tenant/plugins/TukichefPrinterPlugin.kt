package com.tukifac.tenant.plugins

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.concurrent.thread

@CapacitorPlugin(
    name = "TukichefPrinter",
    permissions = [
        Permission(strings = [Manifest.permission.BLUETOOTH_CONNECT], alias = "btConnect"),
        Permission(strings = [Manifest.permission.BLUETOOTH_SCAN], alias = "btScan"),
        Permission(
            strings = [Manifest.permission.ACCESS_FINE_LOCATION],
            alias = "location"
        ),
    ]
)
class TukichefPrinterPlugin : Plugin() {

    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private var bluetoothSocket: BluetoothSocket? = null
    private var connectedName: String? = null
    private var connectedAddress: String? = null
    private val executor = Executors.newSingleThreadExecutor()

    private fun adapter(): BluetoothAdapter? {
        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return mgr?.adapter
    }

    private fun hasBtPermission(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val connect = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
            val scan = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.BLUETOOTH_SCAN
            ) == PackageManager.PERMISSION_GRANTED
            return connect && scan
        }
        @Suppress("DEPRECATION")
        val bt = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.BLUETOOTH
        ) == PackageManager.PERMISSION_GRANTED
        val loc = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return bt && loc
    }

    private fun deviceName(device: BluetoothDevice): String {
        return try {
            if (hasBtPermission()) {
                device.name?.takeIf { it.isNotBlank() } ?: "Dispositivo"
            } else {
                "Dispositivo"
            }
        } catch (_: SecurityException) {
            "Dispositivo"
        }
    }

    private fun deviceToJson(device: BluetoothDevice): JSObject {
        val o = JSObject()
        o.put("name", deviceName(device))
        o.put("address", device.address)
        return o
    }

    @PluginMethod
    fun isBluetoothEnabled(call: PluginCall) {
        val enabled = adapter()?.isEnabled == true
        val ret = JSObject()
        ret.put("enabled", enabled)
        call.resolve(ret)
    }

    @PluginMethod
    fun requestEnableBluetooth(call: PluginCall) {
        val ad = adapter()
        if (ad == null) {
            call.reject("Bluetooth no disponible en este dispositivo")
            return
        }
        if (ad.isEnabled) {
            val ret = JSObject()
            ret.put("requested", false)
            call.resolve(ret)
            return
        }
        val intent = Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
        startActivityForResult(call, intent, "enableBluetooth")
    }

    @PermissionCallback
    private fun enableBluetooth(call: PluginCall) {
        val ret = JSObject()
        ret.put("requested", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun checkBluetoothPermissions(call: PluginCall) {
        val ret = JSObject()
        ret.put("granted", hasBtPermission())
        call.resolve(ret)
    }

    @PluginMethod
    fun requestBluetoothPermissions(call: PluginCall) {
        if (hasBtPermission()) {
            val ret = JSObject()
            ret.put("granted", true)
            call.resolve(ret)
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAliases(
                arrayOf("btConnect", "btScan"),
                call,
                "permissionsCallback"
            )
        } else {
            requestPermissionForAliases(
                arrayOf("location"),
                call,
                "permissionsCallback"
            )
        }
    }

    @PermissionCallback
    private fun permissionsCallback(call: PluginCall) {
        val ret = JSObject()
        ret.put("granted", hasBtPermission())
        call.resolve(ret)
    }

    @PluginMethod
    fun getPairedDevices(call: PluginCall) {
        if (!hasBtPermission()) {
            call.reject("Permisos Bluetooth no concedidos")
            return
        }
        val ad = adapter()
        if (ad == null || !ad.isEnabled) {
            call.reject("Activa Bluetooth para buscar impresoras")
            return
        }
        val arr = JSArray()
        try {
            ad.bondedDevices?.forEach { arr.put(deviceToJson(it)) }
        } catch (e: SecurityException) {
            call.reject("Permiso Bluetooth denegado: ${e.message}")
            return
        }
        val ret = JSObject()
        ret.put("devices", arr)
        call.resolve(ret)
    }

    @PluginMethod
    fun scanDevices(call: PluginCall) {
        if (!hasBtPermission()) {
            call.reject("Permisos Bluetooth no concedidos")
            return
        }
        val ad = adapter() ?: run {
            call.reject("Bluetooth no disponible")
            return
        }
        if (!ad.isEnabled) {
            call.reject("Activa Bluetooth")
            return
        }

        val found = LinkedHashMap<String, JSObject>()
        try {
            ad.bondedDevices?.forEach { found[it.address] = deviceToJson(it) }
        } catch (_: SecurityException) {
        }

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent?.action != BluetoothDevice.ACTION_FOUND) return
                val device: BluetoothDevice? =
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(
                            BluetoothDevice.EXTRA_DEVICE,
                            BluetoothDevice::class.java
                        )
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }
                device?.let {
                    try {
                        found[it.address] = deviceToJson(it)
                    } catch (_: SecurityException) {
                    }
                }
            }
        }

        val filter = IntentFilter(BluetoothDevice.ACTION_FOUND)
        context.registerReceiver(receiver, filter)
        try {
            ad.startDiscovery()
        } catch (e: SecurityException) {
            context.unregisterReceiver(receiver)
            call.reject("No se pudo escanear: ${e.message}")
            return
        }

        thread {
            Thread.sleep(8000)
            try {
                if (hasBtPermission()) ad.cancelDiscovery()
            } catch (_: SecurityException) {
            }
            try {
                context.unregisterReceiver(receiver)
            } catch (_: Exception) {
            }
            val arr = JSArray()
            found.values.forEach { arr.put(it) }
            val ret = JSObject()
            ret.put("devices", arr)
            bridge.executeOnMainThread { call.resolve(ret) }
        }
    }

    @PluginMethod
    fun connectPrinter(call: PluginCall) {
        val address = call.getString("address")?.trim().orEmpty()
        if (address.isEmpty()) {
            call.reject("MAC address requerida")
            return
        }
        if (!hasBtPermission()) {
            call.reject("Permisos Bluetooth no concedidos")
            return
        }
        executor.execute {
            try {
                disconnectInternal()
                val ad = adapter() ?: throw Exception("Bluetooth no disponible")
                val device = ad.getRemoteDevice(address)
                val socket = device.createRfcommSocketToServiceRecord(sppUuid)
                socket.connect()
                bluetoothSocket = socket
                connectedName = deviceName(device)
                connectedAddress = address
                val ret = JSObject()
                ret.put("connected", true)
                ret.put("name", connectedName)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("No se pudo conectar: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun disconnectPrinter(call: PluginCall) {
        executor.execute {
            disconnectInternal()
            call.resolve()
        }
    }

    private fun disconnectInternal() {
        try {
            bluetoothSocket?.close()
        } catch (_: Exception) {
        }
        bluetoothSocket = null
        connectedName = null
        connectedAddress = null
    }

    @PluginMethod
    fun getConnectionStatus(call: PluginCall) {
        val ret = JSObject()
        val connected = bluetoothSocket?.isConnected == true
        ret.put("connected", connected)
        if (connected) {
            ret.put("name", connectedName)
            ret.put("address", connectedAddress)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun printTicket(call: PluginCall) {
        val dataBase64 = call.getString("dataBase64") ?: run {
            call.reject("dataBase64 vacío")
            return
        }
        executor.execute {
            try {
                val bytes = Base64.decode(dataBase64, Base64.DEFAULT)
                writeBluetooth(bytes)
                val ret = JSObject()
                ret.put("ok", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Error al imprimir: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun printTcp(call: PluginCall) {
        val host = call.getString("host")?.trim().orEmpty()
        val port = call.getInt("port") ?: 9100
        val dataBase64 = call.getString("dataBase64") ?: run {
            call.reject("dataBase64 vacío")
            return
        }
        if (host.isEmpty()) {
            call.reject("host vacío")
            return
        }
        executor.execute {
            try {
                val bytes = Base64.decode(dataBase64, Base64.DEFAULT)
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(host, port), 8000)
                    socket.getOutputStream().use { out: OutputStream ->
                        out.write(bytes)
                        out.flush()
                    }
                }
                val ret = JSObject()
                ret.put("ok", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Error TCP: ${e.message}")
            }
        }
    }

    private fun writeBluetooth(bytes: ByteArray) {
        val socket = bluetoothSocket
            ?: throw Exception("Impresora Bluetooth no conectada")
        if (!socket.isConnected) {
            throw Exception("Conexión Bluetooth perdida")
        }
        socket.outputStream.write(bytes)
        socket.outputStream.flush()
    }

    override fun handleOnDestroy() {
        disconnectInternal()
        super.handleOnDestroy()
    }
}
