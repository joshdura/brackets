/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, describe, it, expect, beforeEach, afterEach, waitsFor, runs, $, setTimeout */

define(function (require, exports, module) {
    "use strict";
    
    var FileSystem          = require("filesystem/FileSystem"),
        FileSystemError     = require("filesystem/FileSystemError"),
        MockFileSystemImpl  = require("./MockFileSystemImpl");
    
    describe("FileSystem", function () {
        
        // Setup
        
        var fileSystem;
        
        beforeEach(function () {
            // Create an FS instance for testing
            MockFileSystemImpl.reset();
            fileSystem = new FileSystem._FileSystem();
            fileSystem.init(MockFileSystemImpl);
            fileSystem.watch(fileSystem.getDirectoryForPath("/"), function () {return true; }, function () {});
        });
        
        
        // Utilities
        
        /** Pass this to when() as the 'callback' or 'notify' value to delay invoking the callback or change handler by a fixed amount of time */
        function delay(ms) {
            function generateCbWrapper(cb) {
                function cbReadyToRun() {
                    var _args = arguments;
                    setTimeout(function () {
                        cb.apply(null, _args);
                    }, ms);
                }
                return cbReadyToRun;
            }
            return generateCbWrapper;
        }
        
        
        
        describe("Path normalization", function () {
            // Auto-prepended to both origPath & normPath in all the test helpers below
            var prefix = "";
            
            function expectNormFile(origPath, normPath) {
                var file = fileSystem.getFileForPath(prefix + origPath);
                expect(file.fullPath).toBe(prefix + normPath);
            }
            function expectNormDir(origPath, normPath) {
                var dir = fileSystem.getDirectoryForPath(prefix + origPath);
                expect(dir.fullPath).toBe(prefix + normPath);
            }
            function expectInvalidFile(origPath) {
                function tryToMakeFile() {
                    return fileSystem.getFileForPath(prefix + origPath);
                }
                expect(tryToMakeFile).toThrow();
            }
            
            // Runs all the tests N times, once with each prefix
            function testPrefixes(prefixes, tests) {
                prefixes.forEach(function (pre) {
                    prefix = pre;
                    tests();
                });
                prefix = "";
            }
            
            it("should ensure trailing slash on directory paths", function () {
                testPrefixes(["", "c:"], function () {
                    expectNormDir("/foo", "/foo/");
                    expectNormDir("/foo/bar", "/foo/bar/");
                    
                    // Paths *with* trailing slash should be unaffected
                    expectNormDir("/", "/");
                    expectNormDir("/foo/", "/foo/");
                    expectNormDir("/foo/bar/", "/foo/bar/");
                });
            });
            
            it("should eliminate duplicated (contiguous) slashes", function () {
                testPrefixes(["", "c:"], function () {
                    expectNormDir("//", "/");
                    expectNormDir("///", "/");
                    expectNormDir("//foo", "/foo/");
                    expectNormDir("/foo//", "/foo/");
                    expectNormDir("//foo//", "/foo/");
                    expectNormDir("///foo///", "/foo/");
                    expectNormDir("/foo//bar", "/foo/bar/");
                    expectNormDir("/foo///bar", "/foo/bar/");
                    
                    expectNormFile("//foo", "/foo");
                    expectNormFile("///foo", "/foo");
                    expectNormFile("/foo//bar", "/foo/bar");
                    expectNormFile("/foo///bar", "/foo/bar");
                    expectNormFile("//foo///bar", "/foo/bar");
                    expectNormFile("///foo///bar", "/foo/bar");
                    expectNormFile("///foo//bar", "/foo/bar");
                    expectNormFile("///foo/bar", "/foo/bar");
                });
            });
            
            it("should normalize out '..' segments", function () {
                testPrefixes(["", "c:"], function () {
                    expectNormDir("/foo/..", "/");
                    expectNormDir("/foo/bar/..", "/foo/");
                    expectNormDir("/foo/../bar", "/bar/");
                    expectNormDir("/foo//../bar", "/bar/");  // even with duplicated "/"es
                    expectNormDir("/foo/..//bar", "/bar/");  // even with duplicated "/"es
                    expectNormDir("/foo/one/two/three/../../../bar", "/foo/bar/");
                    expectNormDir("/foo/one/two/../two/three", "/foo/one/two/three/");
                    expectNormDir("/foo/one/two/../three/../bar", "/foo/one/bar/");
                    
                    expectNormFile("/foo/../bar", "/bar");
                    expectNormFile("/foo//../bar", "/bar");  // even with duplicated "/"es
                    expectNormFile("/foo/..//bar", "/bar");  // even with duplicated "/"es
                    expectNormFile("/foo/one/two/three/../../../bar", "/foo/bar");
                    expectNormFile("/foo/one/two/../two/three", "/foo/one/two/three");
                    expectNormFile("/foo/one/two/../three/../bar", "/foo/one/bar");
                    
                    // Can't go back past root
                    expectInvalidFile("/..");
                    expectInvalidFile("/../");
                    expectInvalidFile("/foo/../../bar");
                    expectInvalidFile("/foo/../bar/../..");
                });
            });
        });
        
        
        describe("Singleton enforcement", function () {
            function resolveCallback() {
                var callback = function (err, entry) {
                    callback.error = err;
                    callback.entry = entry;
                    callback.wasCalled = true;
                };
                return callback;
            }
            
            it("should return the same File object for the same path", function () {
                var cb = resolveCallback();
                expect(fileSystem.getFileForPath("/file1.txt")).toEqual(fileSystem.getFileForPath("/file1.txt"));
                expect(fileSystem.getFileForPath("/file1.txt")).not.toEqual(fileSystem.getFileForPath("/file2.txt"));
                runs(function () {
                    fileSystem.resolve("/file1.txt", cb);
                });
                waitsFor(function () { return cb.wasCalled; });
                runs(function () {
                    expect(cb.error).toBeFalsy();
                    expect(fileSystem.getFileForPath("/file1.txt")).toEqual(cb.entry);
                });
            });
            
            it("should return the same Directory object for the same path", function () {
                var cb = resolveCallback();
                expect(fileSystem.getDirectoryForPath("/subdir/")).toEqual(fileSystem.getFileForPath("/subdir/"));
                expect(fileSystem.getDirectoryForPath("/subdir/")).not.toEqual(fileSystem.getFileForPath("/subdir2/"));
                runs(function () {
                    fileSystem.resolve("/subdir/", cb);
                });
                waitsFor(function () { return cb.wasCalled; });
                runs(function () {
                    expect(cb.error).toBeFalsy();
                    expect(fileSystem.getDirectoryForPath("/subdir/")).toEqual(cb.entry);
                });
            });
        });
        
        
        describe("Rename", function () {
            function renameCallback() {
                var callback = function (err) {
                    callback.error = err;
                    callback.wasCalled = true;
                };
                return callback;
            }
            
            it("should rename a File", function () {
                var file = fileSystem.getFileForPath("/file1.txt"),
                    cb = renameCallback();
                
                runs(function () {
                    file.rename("/file1-renamed.txt", cb);
                });
                waitsFor(function () { return cb.wasCalled; });
                runs(function () {
                    expect(cb.error).toBeFalsy();
                    expect(file.fullPath).toBe("/file1-renamed.txt");
                });
            });
            
            it("should fail if the file doesn't exist", function () {
                var file = fileSystem.getFileForPath("/doesnt-exist.txt"),
                    cb = renameCallback();
                
                runs(function () {
                    file.rename("foo.txt", cb);
                });
                waitsFor(function () { return cb.wasCalled; });
                runs(function () {
                    expect(cb.error).toBe(FileSystemError.NOT_FOUND);
                });
            });
            
            it("should fail if the new name already exists", function () {
                var file = fileSystem.getFileForPath("/file1.txt"),
                    cb = renameCallback();
                
                runs(function () {
                    file.rename("/file2.txt", cb);
                });
                waitsFor(function () { return cb.wasCalled; });
                runs(function () {
                    expect(cb.error).toBe(FileSystemError.ALREADY_EXISTS);
                });
            });
            
            it("should rename a Directory", function () {
                var directory = fileSystem.getDirectoryForPath("/subdir/"),
                    file = fileSystem.getFileForPath("/subdir/file3.txt"),
                    cb = renameCallback();
                
                runs(function () {
                    directory.rename("/subdir-renamed/", cb);
                });
                waitsFor(function () { return cb.wasCalled; });
                runs(function () {
                    expect(cb.error).toBeFalsy();
                    expect(directory.fullPath).toBe("/subdir-renamed/");
                    expect(file.fullPath).toBe("/subdir-renamed/file3.txt");
                });
            });
        });
        
        
        describe("Read directory", function () {
            function getContentsCallback() {
                var callback = function (err, contents) {
                    callback.error = err;
                    callback.contents = contents;
                    callback.wasCalled = true;
                };
                return callback;
            }
            
            it("should read a Directory", function () {
                var directory = fileSystem.getDirectoryForPath("/subdir/"),
                    cb = getContentsCallback();
                
                runs(function () {
                    directory.getContents(cb);
                });
                waitsFor(function () { return cb.wasCalled; });
                runs(function () {
                    expect(cb.error).toBeFalsy();
                    expect(cb.contents.length).toBe(2);
                    expect(cb.contents[0].fullPath).toBe("/subdir/file3.txt");
                });
            });
        });
        
        
        describe("Read and write files", function () {
            function readCallback() {
                var callback = function (err, contents, stat) {
                    callback.error = err;
                    callback.contents = contents;
                    callback.stat = stat;
                    callback.wasCalled = true;
                };
                return callback;
            }
            
            function writeCallback() {
                var callback = function (err) {
                    callback.error = err;
                    callback.wasCalled = true;
                };
                return callback;
            }
            
            it("should read and write files", function () {
                var file = fileSystem.getFileForPath("/subdir/file4.txt"),
                    newContents = "New file contents",
                    firstReadCB = readCallback(),
                    writeCB = writeCallback(),
                    secondReadCB = readCallback();
                
                // Verify initial contents
                runs(function () {
                    file.readAsText(firstReadCB);
                });
                waitsFor(function () { return firstReadCB.wasCalled; });
                runs(function () {
                    expect(firstReadCB.error).toBeFalsy();
                    expect(firstReadCB.contents).toBe("File 4 Contents");
                });
                
                // Write new contents
                runs(function () {
                    file.write(newContents, writeCB);
                });
                waitsFor(function () { return writeCB.wasCalled; });
                runs(function () {
                    expect(writeCB.error).toBeFalsy();
                });
                
                // Verify new contents
                runs(function () {
                    file.readAsText(secondReadCB);
                });
                waitsFor(function () { return secondReadCB.wasCalled; });
                runs(function () {
                    expect(secondReadCB.error).toBeFalsy();
                    expect(secondReadCB.contents).toBe(newContents);
                });
            });
        });
        
        
        describe("Event timing", function () {
            
            it("should notify rename callback before 'change' event", function () {
                var origFilePath = "/file1.txt",
                    origFile = fileSystem.getFileForPath(origFilePath),
                    renamedFilePath = "/file1_renamed.txt";
                
                runs(function () {
                    var renameDone = false, changeDone = false;
                    
                    // Delay impl callback to happen after impl watcher notification
                    MockFileSystemImpl.when("rename", origFilePath, {
                        callback: delay(250)
                    });
                    
                    $(fileSystem).on("change", function (evt, entry) {
                        expect(renameDone).toBe(true);  // this is the important check: callback should have already run!
                        changeDone = true;
                    });
                    
                    origFile.rename(renamedFilePath, function (err) {
                        expect(err).toBeFalsy();
                        renameDone = true;
                    });
                    
                    waitsFor(function () { return changeDone && renameDone; });
                });
                
                runs(function () {
                    expect(origFile.fullPath).toBe(renamedFilePath);
                });
            });
            
            
            it("should notify write callback before 'change' event", function () {
                var testFilePath = "/file1.txt",
                    testFile = fileSystem.getFileForPath(testFilePath);
                
                runs(function () {
                    var writeDone = false, changeDone = false;
                    
                    // Delay impl callback to happen after impl watcher notification
                    MockFileSystemImpl.when("writeFile", testFilePath, {
                        callback: delay(250)
                    });
                    
                    $(fileSystem).on("change", function (evt, entry) {
                        expect(writeDone).toBe(true);  // this is the important check: callback should have already run!
                        changeDone = true;
                    });
                    
                    testFile.write("Foobar", function (err) {
                        expect(err).toBeFalsy();
                        writeDone = true;
                    });
                    
                    waitsFor(function () { return changeDone && writeDone; });
                });
            });
            
            // Used for various tests below where two write operations (to two different files) overlap in various ways
            function dualWrite(cb1Delay, watcher1Delay, cb2Delay, watcher2Delay) {
                var testFile1 = fileSystem.getFileForPath("/file1.txt"),
                    testFile2 = fileSystem.getFileForPath("/file2.txt");
                
                runs(function () {
                    var write1Done = false, change1Done = false;
                    var write2Done = false, change2Done = false;
                    
                    // Delay impl callback to happen after impl watcher notification
                    MockFileSystemImpl.when("writeFile", "/file1.txt", {
                        callback: delay(cb1Delay),
                        notify: delay(watcher1Delay)
                    });
                    MockFileSystemImpl.when("writeFile", "/file2.txt", {
                        callback: delay(cb2Delay),
                        notify: delay(watcher2Delay)
                    });
                    
                    $(fileSystem).on("change", function (evt, entry) {
                        // this is the important check: both callbacks should have already run!
                        expect(write1Done).toBe(true);
                        expect(write2Done).toBe(true);
                        
                        expect(entry.fullPath === "/file1.txt" || entry.fullPath === "/file2.txt").toBe(true);
                        if (entry.fullPath === "/file1.txt") {
                            change1Done = true;
                        } else {
                            change2Done = true;
                        }
                    });
                    
                    // We always *start* both operations together, synchronously
                    // What varies is when the impl callbacks for for each op, and when the impl's watcher notices each op
                    fileSystem.getFileForPath("/file1.txt").write("Foobar 1", function (err) {
                        expect(err).toBeFalsy();
                        write1Done = true;
                    });
                    fileSystem.getFileForPath("/file2.txt").write("Foobar 2", function (err) {
                        expect(err).toBeFalsy();
                        write2Done = true;
                    });
                    
                    waitsFor(function () { return change1Done && write1Done && change2Done && write2Done; });
                });
            }
            
            it("should handle overlapping writes to different files - 2nd file finishes much faster", function () {
                dualWrite(100, 200, 0, 0);
            });
            it("should handle overlapping writes to different files - 2nd file finishes much faster, 1st file watcher runs early", function () {
                dualWrite(200, 100, 0, 0);
            });
            it("should handle overlapping writes to different files - 1st file finishes much faster", function () {
                dualWrite(0, 0, 100, 200);
            });
            it("should handle overlapping writes to different files - 1st file finishes much faster, 2nd file watcher runs early", function () {
                dualWrite(0, 0, 200, 100);
            });
            it("should handle overlapping writes to different files - both watchers run early", function () {
                dualWrite(100, 0, 200, 0);
            });
            it("should handle overlapping writes to different files - both watchers run early, reversed", function () {
                dualWrite(100, 50, 200, 0);
            });
            it("should handle overlapping writes to different files - 2nd file finishes faster, both watchers run early", function () {
                dualWrite(200, 0, 100, 0);
            });
            it("should handle overlapping writes to different files - 2nd file finishes faster, both watchers run early, reversed", function () {
                dualWrite(200, 50, 100, 0);
            });
            it("should handle overlapping writes to different files - watchers run in order", function () {
                dualWrite(0, 100, 0, 200);
            });
            it("should handle overlapping writes to different files - watchers reversed", function () {
                dualWrite(0, 200, 0, 100);
            });
            it("should handle overlapping writes to different files - nonoverlapping in order", function () {
                dualWrite(0, 50, 100, 200);
            });
            it("should handle overlapping writes to different files - nonoverlapping reversed", function () {
                dualWrite(100, 200, 0, 50);
            });
            it("should handle overlapping writes to different files - overlapped in order", function () {
                dualWrite(0, 100, 50, 200);
            });
            it("should handle overlapping writes to different files - overlapped reversed", function () {
                dualWrite(50, 200, 0, 100);
            });
        });
        
        
    });
});
