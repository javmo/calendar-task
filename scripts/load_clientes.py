"""
Script para cargar la base de datos de clientes en MongoDB.
Colección: clientes
"""
import os
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "calendario")

CLIENTES = [
    {"nombre": "Agustina Lopez", "cuit": "23353798464", "claveArca": "Agus35379846", "claveAgip": "Agus35379846", "claveArba": "", "otraClave": "", "formaPago": "Red Link"},
    {"nombre": "Alejo Estebecorena", "cuit": "20222930953", "claveArca": "HedsSH2025", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Andres Scaliter", "cuit": "20266328924", "claveArca": "25Perercito", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Beatriz Orellana", "cuit": "27059391459", "claveArca": "Cuit27059391459", "claveAgip": "-", "claveArba": "Josefina2015", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Belen Pianesi", "cuit": "27351430430", "claveArca": "Cuit27351430430", "claveAgip": "-", "claveArba": "351430", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Carla Mariel Romero", "cuit": "23370197024", "claveArca": "Maquieyras9716", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Carolina Hidalgo", "cuit": "27238042785", "claveArca": "Carito2026", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Cecilia Dho", "cuit": "27283027223", "claveArca": "28302722Cecilia", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": "Pago mis cuentas"},
    {"nombre": "Claudio Eduardo Petrelli", "cuit": "20160572389", "claveArca": "Cuit20160572389", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Daniel Gonzalez", "cuit": "20103601097", "claveArca": "Cuit20103601097", "claveAgip": "-", "claveArba": "P4ncub32931", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Diego Haberman", "cuit": "20233743403", "claveArca": "Cuit20233743403", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Diego Touceda", "cuit": "20302263796", "claveArca": "Cuit_20302263796_", "claveAgip": "1983diegui", "claveArba": "Mare2010", "otraClave": "-", "formaPago": "-"},
    {"nombre": "Eduardo Gonzalez", "cuit": "20256956978", "claveArca": "20256956978Cuit", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": "Red Link"},
    {"nombre": "Fabian Recchia", "cuit": "20214824044", "claveArca": "20214824044cuiT", "claveAgip": "-", "claveArba": "102897", "otraClave": "-", "formaPago": "-"},
    {"nombre": "Francisco Blanco", "cuit": "23288628319", "claveArca": "Franblanco2026", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "-"},
    {"nombre": "Franco Cervetto", "cuit": "20417031503", "claveArca": "Fr4nc016@!", "claveAgip": "Fr4nc015", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Guido Spairani", "cuit": "20317531932", "claveArca": "20317531932Guido", "claveAgip": "yani0801", "claveArba": "-", "otraClave": "-", "formaPago": "Red Link"},
    {"nombre": "Guillermina Sandra Guzzeti", "cuit": "27278071494", "claveArca": "AlfaCentauri1909", "claveAgip": "1fa35c2e", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Hector Espinola", "cuit": "20940427186", "claveArca": "Cuit20940427186", "claveAgip": "-", "claveArba": "736Pedernera736", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Hierros Misa", "cuit": "30718003608", "claveArca": "", "claveAgip": "-", "claveArba": "20Francisco", "otraClave": "-", "formaPago": "-"},
    {"nombre": "Honos Temis", "cuit": "30716796570", "claveArca": "AlfaCentauri1909", "claveAgip": "1fa35c2e", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Jonathan Sacaba", "cuit": "20307023882", "claveArca": "JServicios26", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "QR"},
    {"nombre": "Jorge Zappettini", "cuit": "20044003547", "claveArca": "Cuit20044003547", "claveAgip": "hugo1942", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Lara Gonzalez Lanzillota", "cuit": "23397601854", "claveArca": "Lumos2025!", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Leandra Italiani", "cuit": "27230373618", "claveArca": "PabloMaq2803", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Leonela Librera", "cuit": "27369426546", "claveArca": "Cuit27369426546", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": "QR"},
    {"nombre": "Luisa Enith Gomez", "cuit": "27951916523", "claveArca": "Arca190226", "claveAgip": "David27092013", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Maite Madinaveitia", "cuit": "27351462790", "claveArca": "Cuit27351462790", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "-"},
    {"nombre": "Manuel Almiron", "cuit": "20165588925", "claveArca": "Cuit20165588925", "claveAgip": "rocha1980", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Maria Sol Gonzalez Lanzillota", "cuit": "27371208645", "claveArca": "MaSol0310Gonzalez", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "-"},
    {"nombre": "Melina Ercoli", "cuit": "27414716364", "claveArca": "Melina1002", "claveAgip": "meli12898", "claveArba": "-", "otraClave": "-", "formaPago": "-"},
    {"nombre": "Micaela Fernandez Alvi", "cuit": "27380733809", "claveArca": "38073380Dnin", "claveAgip": "3854!Olazabal", "claveArba": "-", "otraClave": "-", "formaPago": "-"},
    {"nombre": "Micaela Vazquez", "cuit": "23320368324", "claveArca": "Mila24012022", "claveAgip": "-", "claveArba": "Mouse975", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Pablo Azor", "cuit": "20242793758", "claveArca": "20242793758Dnin", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Pablo Luis Maquieyra", "cuit": "20222479127", "claveArca": "MaqPablo198", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Pablo Martinez Roca", "cuit": "20270000844", "claveArca": "20270000844Dnin", "claveAgip": "", "claveArba": "", "otraClave": "", "formaPago": "Pagos mis cuentas"},
    {"nombre": "Pedro Andrade", "cuit": "20168839333", "claveArca": "16883933Dnin", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "-"},
    {"nombre": "Rocío Lorusso", "cuit": "27356213837", "claveArca": "27356213837Dnin", "claveAgip": "Lorussora5712", "claveArba": "-", "otraClave": "-", "formaPago": "Red Link"},
    {"nombre": "Rosana Canone", "cuit": "27179709622", "claveArca": "Arca221066", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Rosana Diem", "cuit": "27301382850", "claveArca": "Rosana2026", "claveAgip": "-", "claveArba": "320216", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Sergio Agresti", "cuit": "20245600993", "claveArca": "20245600993Dnin", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Sociedad de Diseño SRL", "cuit": "30715595911", "claveArca": "Javier2025", "claveAgip": "javi2018", "claveArba": "", "otraClave": "", "formaPago": ""},
    {"nombre": "Soledad Carlini", "cuit": "27293815440", "claveArca": "27293815440Dnin", "claveAgip": "-", "claveArba": "FranMora01", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Sucesion Sobrado", "cuit": "27047830538", "claveArca": "27047830538Sobrado", "claveAgip": "4783053Dnin", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Tamara Maquieyra", "cuit": "27359858812", "claveArca": "27359858812Dnin", "claveAgip": "-", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Valle Trivellini", "cuit": "27315601601", "claveArca": "27315601601Dnin", "claveAgip": "1983diegui", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Victoria Carlini", "cuit": "27315751549", "claveArca": "27315751549Dnin", "claveAgip": "2007Joaquin", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Victoria Recchia", "cuit": "27400181735", "claveArca": "27400181735Dnin", "claveAgip": "dnin40018", "claveArba": "-", "otraClave": "-", "formaPago": "Pago mis cuentas"},
    {"nombre": "Virginia Esquivel", "cuit": "27312926968", "claveArca": "Arca190226", "claveAgip": "Virgi02101984", "claveArba": "-", "otraClave": "-", "formaPago": "-"},
]


def main():
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]

    # Drop existing clientes collection
    db.clientes.drop()
    print("✅ Colección 'clientes' limpiada")

    # Add clienteId and createdAt
    now = datetime.now(timezone.utc).isoformat()
    for i, c in enumerate(CLIENTES, 1):
        c["clienteId"] = i
        c["createdAt"] = now

    result = db.clientes.insert_many(CLIENTES)
    print(f"✅ {len(result.inserted_ids)} clientes insertados")

    # Create indexes
    db.clientes.create_index("clienteId", unique=True)
    db.clientes.create_index("nombre", unique=True)
    db.clientes.create_index("cuit")
    print("✅ Índices creados")

    client.close()
    print("\n🎉 ¡Base de datos de clientes cargada!")


if __name__ == "__main__":
    main()
