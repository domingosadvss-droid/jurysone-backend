"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtendimentosController = void 0;
var common_1 = require("@nestjs/common");
var jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
var AtendimentosController = function () {
    var _classDecorators = [(0, common_1.Controller)('atendimentos'), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard)];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _createCompleteAtendimento_decorators;
    var _listAll_decorators;
    var _getOne_decorators;
    var _updateStatus_decorators;
    var _filterByStatus_decorators;
    var AtendimentosController = _classThis = /** @class */ (function () {
        function AtendimentosController_1(atendimentosService) {
            this.atendimentosService = (__runInitializers(this, _instanceExtraInitializers), atendimentosService);
        }
        /**
         * POST /atendimentos
         * Create a complete intake (client + case + financial + docs)
         */
        AtendimentosController_1.prototype.createCompleteAtendimento = function (req, createAtendimentoDto) {
            return __awaiter(this, void 0, void 0, function () {
                var escritorioId;
                return __generator(this, function (_a) {
                    escritorioId = req.user.escritorioId;
                    return [2 /*return*/, this.atendimentosService.createCompleteAtendimento(escritorioId, createAtendimentoDto)];
                });
            });
        };
        /**
         * GET /atendimentos
         * List all atendimentos with optional filtering
         */
        AtendimentosController_1.prototype.listAll = function (req_1, status_1, area_1) {
            return __awaiter(this, arguments, void 0, function (req, status, area, page, limit) {
                var escritorioId;
                if (page === void 0) { page = 1; }
                if (limit === void 0) { limit = 20; }
                return __generator(this, function (_a) {
                    escritorioId = req.user.escritorioId;
                    return [2 /*return*/, this.atendimentosService.listAtendimentos(escritorioId, { status: status, area: area, page: page, limit: limit })];
                });
            });
        };
        /**
         * GET /atendimentos/:id
         * Get a single atendimento by ID
         */
        AtendimentosController_1.prototype.getOne = function (req, id) {
            return __awaiter(this, void 0, void 0, function () {
                var escritorioId;
                return __generator(this, function (_a) {
                    escritorioId = req.user.escritorioId;
                    return [2 /*return*/, this.atendimentosService.getAtendimentoById(escritorioId, id)];
                });
            });
        };
        /**
         * PATCH /atendimentos/:id/status
         * Update atendimento status
         */
        AtendimentosController_1.prototype.updateStatus = function (req, id, updateDto) {
            return __awaiter(this, void 0, void 0, function () {
                var escritorioId;
                return __generator(this, function (_a) {
                    escritorioId = req.user.escritorioId;
                    return [2 /*return*/, this.atendimentosService.updateStatus(escritorioId, id, updateDto.status)];
                });
            });
        };
        /**
         * GET /atendimentos/status/:status
         * Filter atendimentos by status
         */
        AtendimentosController_1.prototype.filterByStatus = function (req_1, status_1) {
            return __awaiter(this, arguments, void 0, function (req, status, page, limit) {
                var escritorioId;
                if (page === void 0) { page = 1; }
                if (limit === void 0) { limit = 20; }
                return __generator(this, function (_a) {
                    escritorioId = req.user.escritorioId;
                    return [2 /*return*/, this.atendimentosService.filterByStatus(escritorioId, status, page, limit)];
                });
            });
        };
        return AtendimentosController_1;
    }());
    __setFunctionName(_classThis, "AtendimentosController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _createCompleteAtendimento_decorators = [(0, common_1.Post)(), (0, common_1.HttpCode)(common_1.HttpStatus.CREATED)];
        _listAll_decorators = [(0, common_1.Get)()];
        _getOne_decorators = [(0, common_1.Get)(':id')];
        _updateStatus_decorators = [(0, common_1.Patch)(':id/status')];
        _filterByStatus_decorators = [(0, common_1.Get)('status/:status')];
        __esDecorate(_classThis, null, _createCompleteAtendimento_decorators, { kind: "method", name: "createCompleteAtendimento", static: false, private: false, access: { has: function (obj) { return "createCompleteAtendimento" in obj; }, get: function (obj) { return obj.createCompleteAtendimento; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _listAll_decorators, { kind: "method", name: "listAll", static: false, private: false, access: { has: function (obj) { return "listAll" in obj; }, get: function (obj) { return obj.listAll; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getOne_decorators, { kind: "method", name: "getOne", static: false, private: false, access: { has: function (obj) { return "getOne" in obj; }, get: function (obj) { return obj.getOne; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _updateStatus_decorators, { kind: "method", name: "updateStatus", static: false, private: false, access: { has: function (obj) { return "updateStatus" in obj; }, get: function (obj) { return obj.updateStatus; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _filterByStatus_decorators, { kind: "method", name: "filterByStatus", static: false, private: false, access: { has: function (obj) { return "filterByStatus" in obj; }, get: function (obj) { return obj.filterByStatus; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AtendimentosController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AtendimentosController = _classThis;
}();
exports.AtendimentosController = AtendimentosController;
