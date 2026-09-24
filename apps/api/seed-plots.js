"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var client_1 = require("@prisma/client");
var adapter_pg_1 = require("@prisma/adapter-pg");
var prisma = new client_1.PrismaClient({
    adapter: new adapter_pg_1.PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
function square(c, d) {
    if (d === void 0) { d = 0.0009; }
    var lat = c.lat, lng = c.lng;
    return {
        type: "Polygon",
        coordinates: [
            [
                [lng - d, lat - d],
                [lng + d, lat - d],
                [lng + d, lat + d],
                [lng - d, lat + d],
                [lng - d, lat - d],
            ],
        ],
    };
}
var data = [
    { id: 'klp-1', mouza: 'Rajamehar', upazila: 'Debidwar', district: 'Cumilla', dagNo: '110', landUse: 'agricultural', areaDecimals: 50, centroidLat: 23.550, centroidLng: 90.990, boundaryGeoJson: square({ lat: 23.550, lng: 90.990 }), status: 'available', unitPricePerYear: 50 },
    { id: 'klp-2', mouza: 'Rajamehar', upazila: 'Debidwar', district: 'Cumilla', dagNo: '115', landUse: 'non-agricultural', areaDecimals: 12, centroidLat: 23.552, centroidLng: 90.992, boundaryGeoJson: square({ lat: 23.552, lng: 90.992 }), status: 'available', unitPricePerYear: 100 },
    { id: 'klp-3', mouza: 'Payalgacha', upazila: 'Barura', district: 'Cumilla', dagNo: '220', landUse: 'agricultural', areaDecimals: 120, centroidLat: 23.360, centroidLng: 91.030, boundaryGeoJson: square({ lat: 23.360, lng: 91.030 }), status: 'available', unitPricePerYear: 60 },
    { id: 'klp-4', mouza: 'Payalgacha', upazila: 'Barura', district: 'Cumilla', dagNo: '225', landUse: 'non-agricultural', areaDecimals: 8, centroidLat: 23.362, centroidLng: 91.032, boundaryGeoJson: square({ lat: 23.362, lng: 91.032 }), status: 'available', unitPricePerYear: 120 },
    { id: 'klp-5', mouza: 'Debidwar', upazila: 'Debidwar', district: 'Cumilla', dagNo: '45', landUse: 'non-agricultural', areaDecimals: 5, centroidLat: 23.555, centroidLng: 90.985, boundaryGeoJson: square({ lat: 23.555, lng: 90.985 }), status: 'available', unitPricePerYear: 150 },
    { id: 'klp-6', mouza: 'Debidwar', upazila: 'Debidwar', district: 'Cumilla', dagNo: '48', landUse: 'agricultural', areaDecimals: 40, centroidLat: 23.556, centroidLng: 90.986, boundaryGeoJson: square({ lat: 23.556, lng: 90.986 }), status: 'available', unitPricePerYear: 50 },
    { id: 'klp-7', mouza: 'Payalgacha', upazila: 'Barura', district: 'Cumilla', dagNo: '230', landUse: 'non-agricultural', areaDecimals: 15, centroidLat: 23.364, centroidLng: 91.034, boundaryGeoJson: square({ lat: 23.364, lng: 91.034 }), status: 'available', unitPricePerYear: 110 },
];
function seedPlots() {
    return __awaiter(this, void 0, void 0, function () {
        var _i, data_1, plot, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _i = 0, data_1 = data;
                    _a.label = 1;
                case 1:
                    if (!(_i < data_1.length)) return [3 /*break*/, 6];
                    plot = data_1[_i];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, prisma.khasLandPlot.upsert({
                            where: { id: plot.id },
                            update: plot,
                            create: plot,
                        })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    e_1 = _a.sent();
                    console.error(e_1);
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6:
                    console.log('Plots seeded');
                    return [2 /*return*/];
            }
        });
    });
}
seedPlots().finally(function () { return prisma.$disconnect(); });
